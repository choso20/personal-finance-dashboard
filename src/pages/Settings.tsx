import { Download, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import { Card, ConfirmDialog, Field, Modal, PageHeader, downloadText } from '../components/ui';
import { deleteAllData, deleteProfile, exportBackup, restoreBackup, updateSettings } from '../db/repo';
import { useBudgets, useCategories, useProfiles, useRules, useSettings, useTransactions } from '../hooks/useData';
import { parseBackup } from '../lib/backup';
import type { Backup, Settings } from '../types';

const CURRENCIES = ['£', '$', '€', '¥', 'CHF ', 'kr ', 'zł ', 'R', '₹', 'A$', 'C$'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsPage() {
  const settings = useSettings();
  const txs = useTransactions() ?? [];
  const rules = useRules() ?? [];
  const categories = useCategories() ?? [];
  const budgets = useBudgets() ?? [];
  const profiles = useProfiles() ?? [];
  const toast = useToast();
  const [pendingRestore, setPendingRestore] = useState<Backup | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    const b = await exportBackup();
    downloadText(`ledger-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2), 'application/json');
  };

  const onBackupFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = parseBackup(String(reader.result ?? ''));
      if (!r.ok || !r.backup) {
        toast(`Invalid backup: ${r.errors[0]}`, 'error');
        return;
      }
      setPendingRestore(r.backup);
    };
    reader.readAsText(f);
  };

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Display">
          <div className="grid gap-4">
            <Field label="Currency symbol">
              <div className="flex gap-2">
                <input className="input w-24" value={settings.currencySymbol} onChange={(e) => updateSettings({ currencySymbol: e.target.value })} />
                <div className="flex flex-wrap gap-1">
                  {CURRENCIES.map((c) => (
                    <button key={c} className={settings.currencySymbol === c ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => updateSettings({ currencySymbol: c })}>
                      {c.trim()}
                    </button>
                  ))}
                </div>
              </div>
            </Field>
            <Field label="Theme">
              <select className="input" value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as Settings['theme'] })}>
                <option value="system">Follow system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </Field>
            <Field label="First day of week">
              <select className="input" value={settings.firstDayOfWeek} onChange={(e) => updateSettings({ firstDayOfWeek: parseInt(e.target.value, 10) as Settings['firstDayOfWeek'] })}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First day of month" hint="Set this to your payday (e.g. 25) to make budgets and monthly charts run payday to payday.">
              <input type="number" min="1" max="28" className="input w-24" value={settings.firstDayOfMonth} onChange={(e) => updateSettings({ firstDayOfMonth: Math.max(1, Math.min(28, parseInt(e.target.value, 10) || 1)) })} />
            </Field>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Backup">
            <p className="mb-3 text-sm text-slate-500">A full backup includes transactions, rules, categories, budgets, bank profiles, subscription decisions and settings.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={exportJson}>
                <Download size={16} /> Export backup (JSON)
              </button>
              <button className="btn-secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Restore from backup
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onBackupFile(f); e.target.value = ''; }} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Count label="Transactions" n={txs.length} />
              <Count label="Rules" n={rules.length} />
              <Count label="Categories" n={categories.length} />
              <Count label="Budgets" n={budgets.length} />
            </dl>
          </Card>

          <Card title="Bank profiles">
            {profiles.length === 0 ? (
              <p className="text-sm text-slate-500">No saved profiles. Save one from the Import page.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
                {profiles.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">
                        {p.mapping.dateFormat} · {p.mapping.amountMode === 'split' ? 'debit/credit' : 'signed amount'}
                        {p.mapping.invertSign ? ' · inverted' : ''}
                      </div>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => deleteProfile(p.id)} aria-label="Delete profile">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Danger zone">
            <p className="mb-3 text-sm text-slate-500">Permanently delete everything stored in this browser. Export a backup first if you might want it back.</p>
            <button className="btn-danger" onClick={() => setConfirmDeleteAll(true)}>
              <Trash2 size={16} /> Delete all data
            </button>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore backup"
        message={
          <>
            This replaces <b>all</b> current data with the backup from {pendingRestore ? new Date(pendingRestore.exportedAt).toLocaleString() : ''} ({pendingRestore?.transactions.length ?? 0} transactions, {pendingRestore?.rules.length ?? 0} rules). Continue?
          </>
        }
        confirmLabel="Restore"
        danger
        onCancel={() => setPendingRestore(null)}
        onConfirm={async () => {
          if (pendingRestore) {
            await restoreBackup(pendingRestore);
            toast('Backup restored', 'success');
          }
          setPendingRestore(null);
        }}
      />

      <Modal open={confirmDeleteAll} onClose={() => setConfirmDeleteAll(false)} title="Delete all data">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This deletes all {txs.length} transactions, your rules, categories, budgets, profiles and settings from this browser. This cannot be undone. Type <b>DELETE</b> to confirm.
        </p>
        <input className="input mt-3" value={deleteText} onChange={(e) => setDeleteText(e.target.value)} placeholder="DELETE" />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setConfirmDeleteAll(false)}>
            Cancel
          </button>
          <button
            className="btn-danger"
            disabled={deleteText !== 'DELETE'}
            onClick={async () => {
              await deleteAllData();
              setConfirmDeleteAll(false);
              setDeleteText('');
              toast('All data deleted', 'success');
            }}
          >
            Delete everything
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{n}</dd>
    </div>
  );
}
