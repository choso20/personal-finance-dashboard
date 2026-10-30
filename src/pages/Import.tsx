import { AlertTriangle, CheckCircle2, FileText, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CategoryBadge } from '../components/CategorySelect';
import { useToast } from '../components/Toast';
import { Card, Field, PageHeader, Toggle } from '../components/ui';
import { commitImport, existingHashes, saveProfile, type ImportSummary } from '../db/repo';
import { useCategoryMap, useImportBatches, useMoney, useProfiles, useRules } from '../hooks/useData';
import { UNCATEGORIZED_ID } from '../lib/categories';
import { convertRows, guessMapping, headerSignature, parseCsvText, planImport, type ConversionResult } from '../lib/csv';
import { DATE_FORMATS, detectDateFormat } from '../lib/dates';
import { newId } from '../lib/ids';
import { findMatchingRule, sortRules } from '../lib/rules';
import type { BankProfile, ColumnMapping } from '../types';
import sampleCurrent from '../../sample-data/current-account.csv?raw';
import sampleJoint from '../../sample-data/joint-account-debit-credit.csv?raw';
import sampleUs from '../../sample-data/us-credit-card.csv?raw';

interface LoadedFile {
  name: string;
  text: string;
  mappingHint?: Partial<ColumnMapping>;
}

const SAMPLES: { label: string; file: LoadedFile; note: string }[] = [
  { label: 'Current account', note: 'ISO dates, signed amount column', file: { name: 'current-account.csv', text: sampleCurrent, mappingHint: { defaultAccount: 'Current Account' } } },
  { label: 'Joint account', note: 'DD/MM/YYYY, Paid Out / Paid In columns', file: { name: 'joint-account-debit-credit.csv', text: sampleJoint, mappingHint: { defaultAccount: 'Joint Account' } } },
  { label: 'US credit card', note: 'MM/DD/YYYY, charges positive (invert sign)', file: { name: 'us-credit-card.csv', text: sampleUs, mappingHint: { defaultAccount: 'Credit Card', invertSign: true } } },
];

export function ImportPage() {
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const batches = useImportBatches() ?? [];

  return (
    <div>
      <PageHeader title="Import" subtitle="Import a CSV export from your bank. Files are read in your browser and never uploaded." />
      {summary ? (
        <ImportDone summary={summary} onReset={() => { setSummary(null); setFile(null); }} />
      ) : file ? (
        <MappingStep file={file} onBack={() => setFile(null)} onDone={setSummary} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DropZone onFile={setFile} />
          </div>
          <div className="space-y-6">
            <Card title="Try with sample data">
              <ul className="space-y-2">
                {SAMPLES.map((s) => (
                  <li key={s.label}>
                    <button className="w-full rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => setFile(s.file)}>
                      <div className="text-sm font-medium">{s.label}</div>
                      <div className="text-xs text-slate-500">{s.note}</div>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            {batches.length > 0 && (
              <Card title="Recent imports">
                <ul className="space-y-2 text-sm">
                  {batches.map((b) => (
                    <li key={b.id} className="flex justify-between gap-2">
                      <span className="truncate">{b.fileName}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        +{b.newCount} · {b.duplicateCount} dup · {b.errorCount} err
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({ onFile }: { onFile: (f: LoadedFile) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const read = useCallback(
    (f: File) => {
      const reader = new FileReader();
      reader.onload = () => onFile({ name: f.name, text: String(reader.result ?? '') });
      reader.onerror = () => toast('Could not read file', 'error');
      reader.readAsText(f);
    },
    [onFile, toast],
  );

  return (
    <div
      className={`flex min-h-[18rem] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition ${
        drag ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) read(f);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      <Upload size={36} className="mb-3 text-indigo-500" />
      <div className="text-base font-medium">Drop a CSV here, or click to choose a file</div>
      <div className="mt-1 text-sm text-slate-500">You'll map the columns on the next step. Nothing leaves your device.</div>
      <input ref={inputRef} type="file" accept=".csv,text/csv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
    </div>
  );
}

function MappingStep({ file, onBack, onDone }: { file: LoadedFile; onBack: () => void; onDone: (s: ImportSummary) => void }) {
  const parsed = useMemo(() => parseCsvText(file.text), [file.text]);
  const profiles = useProfiles() ?? [];
  const rules = useRules() ?? [];
  const catMap = useCategoryMap();
  const fmt = useMoney();
  const toast = useToast();
  const signature = useMemo(() => headerSignature(parsed.headers), [parsed.headers]);
  const matchingProfile = useMemo(() => profiles.find((p) => p.headerSignature === signature), [profiles, signature]);

  const [mapping, setMapping] = useState<ColumnMapping>(() => ({ ...guessMapping(parsed.headers, parsed.rows), ...file.mappingHint }));
  const [profileId, setProfileId] = useState<string>('');
  const [profileName, setProfileName] = useState('');
  const [saveAsProfile, setSaveAsProfile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  // Auto-apply a matching saved profile once
  const appliedRef = useRef(false);
  useEffect(() => {
    if (matchingProfile && !appliedRef.current) {
      appliedRef.current = true;
      setMapping(matchingProfile.mapping);
      setProfileId(matchingProfile.id);
    }
  }, [matchingProfile]);

  const applyProfile = (p: BankProfile | undefined) => {
    if (!p) {
      setProfileId('');
      setMapping({ ...guessMapping(parsed.headers, parsed.rows), ...file.mappingHint });
      return;
    }
    setProfileId(p.id);
    setMapping(p.mapping);
  };

  const dateIdx = parsed.headers.indexOf(mapping.date);
  const detection = useMemo(
    () => detectDateFormat(dateIdx >= 0 ? parsed.rows.slice(0, 50).map((r) => r[dateIdx] ?? '') : []),
    [parsed.rows, dateIdx],
  );

  const conversion: ConversionResult = useMemo(() => convertRows(parsed.headers, parsed.rows, mapping), [parsed, mapping]);
  const sortedRules = useMemo(() => sortRules(rules), [rules]);

  const previewRows = conversion.rows.slice(0, 10);
  const mappingErrors: string[] = [];
  if (!mapping.date) mappingErrors.push('Choose a date column.');
  if (!mapping.description) mappingErrors.push('Choose a description column.');
  if (mapping.amountMode === 'single' && !mapping.amount) mappingErrors.push('Choose an amount column.');
  if (mapping.amountMode === 'split' && (!mapping.debit || !mapping.credit)) mappingErrors.push('Choose both debit and credit columns.');
  if (saveAsProfile && !profileName.trim()) mappingErrors.push('Give the bank profile a name.');

  const doImport = async () => {
    if (mappingErrors.length) return;
    setImporting(true);
    try {
      const batchId = newId('batch');
      const existing = await existingHashes();
      const plan = planImport(conversion.rows, existing, { batchId, defaultCategoryId: UNCATEGORIZED_ID, idFactory: () => newId('tx') });
      let profileLabel = profiles.find((p) => p.id === profileId)?.name;
      if (saveAsProfile && profileName.trim()) {
        const p: BankProfile = { id: newId('profile'), name: profileName.trim(), mapping, headerSignature: signature, createdAt: Date.now() };
        await saveProfile(p);
        profileLabel = p.name;
      }
      const summary = await commitImport(plan.newTransactions, {
        batchId,
        fileName: file.name,
        profileName: profileLabel,
        duplicateCount: plan.duplicateCount,
        errorCount: conversion.errors.length,
      });
      onDone(summary);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const colSelect = (value: string | undefined, onChange: (v: string | undefined) => void, optional = false) => (
    <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {optional && <option value="">— none —</option>}
      {!optional && !value && <option value="">Choose…</option>}
      {parsed.headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <FileText size={16} /> {file.name}
            </span>
          }
          actions={
            <button className="btn-ghost btn-sm" onClick={onBack}>
              Choose another file
            </button>
          }
        >
          <div className="text-sm text-slate-500">
            {parsed.rows.length} rows · {parsed.headers.length} columns
            {parsed.warnings.length > 0 && <span className="ml-2 text-amber-600">· {parsed.warnings.length} parser warning(s)</span>}
          </div>
        </Card>

        <Card title="Bank profile">
          <Field label="Use a saved profile" hint={matchingProfile ? `"${matchingProfile.name}" matches this file's columns.` : profiles.length ? undefined : 'Save this mapping below to make the next import from this bank one click.'}>
            <select className="input" value={profileId} onChange={(e) => applyProfile(profiles.find((p) => p.id === e.target.value))}>
              <option value="">— map columns manually —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Toggle checked={saveAsProfile} onChange={setSaveAsProfile} label="Save this mapping as a new profile" />
            {saveAsProfile && <input className="input flex-1" placeholder="Profile name, e.g. Monzo current" value={profileName} onChange={(e) => setProfileName(e.target.value)} />}
          </div>
        </Card>

        <Card title="Column mapping">
          <div className="grid gap-3">
            <Field label="Date column">{colSelect(mapping.date, (v) => setMapping({ ...mapping, date: v ?? '' }))}</Field>
            <Field
              label="Date format"
              hint={
                detection.ambiguous ? (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle size={12} /> Ambiguous: every date fits more than one format. Check the preview and pick the right one.
                  </span>
                ) : detection.format ? (
                  `Detected ${detection.format}`
                ) : (
                  'Could not auto-detect — pick a format.'
                )
              }
            >
              <select className="input" value={mapping.dateFormat} onChange={(e) => setMapping({ ...mapping, dateFormat: e.target.value })}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                    {detection.candidates.includes(f) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description column">{colSelect(mapping.description, (v) => setMapping({ ...mapping, description: v ?? '' }))}</Field>
            <Field label="Amount layout">
              <select className="input" value={mapping.amountMode} onChange={(e) => setMapping({ ...mapping, amountMode: e.target.value as ColumnMapping['amountMode'] })}>
                <option value="single">One signed amount column</option>
                <option value="split">Separate debit and credit columns</option>
              </select>
            </Field>
            {mapping.amountMode === 'single' ? (
              <Field label="Amount column">{colSelect(mapping.amount, (v) => setMapping({ ...mapping, amount: v }))}</Field>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Debit (money out)">{colSelect(mapping.debit, (v) => setMapping({ ...mapping, debit: v }))}</Field>
                <Field label="Credit (money in)">{colSelect(mapping.credit, (v) => setMapping({ ...mapping, credit: v }))}</Field>
              </div>
            )}
            <Toggle checked={mapping.invertSign} onChange={(v) => setMapping({ ...mapping, invertSign: v })} label="Invert sign (use when spending shows as positive)" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Balance column (optional)">{colSelect(mapping.balance, (v) => setMapping({ ...mapping, balance: v }), true)}</Field>
              <Field label="Account column (optional)">{colSelect(mapping.account, (v) => setMapping({ ...mapping, account: v }), true)}</Field>
            </div>
            {!mapping.account && (
              <Field label="Account name" hint="Used for every row since no account column is mapped.">
                <input className="input" value={mapping.defaultAccount} onChange={(e) => setMapping({ ...mapping, defaultAccount: e.target.value })} />
              </Field>
            )}
          </div>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-3">
        <Card title="Raw preview (first 10 rows)">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  {parsed.headers.map((h) => (
                    <th key={h} className="th whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800/60">
                    {r.map((c, j) => (
                      <td key={j} className="max-w-[16rem] truncate px-3 py-1.5 font-mono">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          title="Parsed preview"
          actions={
            <span className="text-xs text-slate-500">
              {conversion.rows.length} ok · {conversion.errors.length} errors
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="th">Date</th>
                  <th className="th">Description</th>
                  <th className="th">Category (by rules)</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Account</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => {
                  const rule = findMatchingRule(sortedRules, r);
                  return (
                    <tr key={r.rowIndex} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td className="td whitespace-nowrap font-mono text-xs">{r.date}</td>
                      <td className="td max-w-[18rem] truncate">{r.description}</td>
                      <td className="td">
                        <CategoryBadge category={catMap.get(rule?.action.categoryId ?? UNCATEGORIZED_ID)} />
                      </td>
                      <td className={`td text-right tabular-nums ${r.amount < 0 ? '' : 'text-emerald-600 dark:text-emerald-400'}`}>{fmt(r.amount, { signed: true })}</td>
                      <td className="td text-xs text-slate-500">{r.account}</td>
                    </tr>
                  );
                })}
                {previewRows.length === 0 && (
                  <tr>
                    <td className="td text-slate-500" colSpan={5}>
                      No rows could be parsed with this mapping.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {conversion.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="font-medium">{conversion.errors.length} row(s) will be skipped:</div>
              <ul className="mt-1 list-inside list-disc">
                {(showAllErrors ? conversion.errors : conversion.errors.slice(0, 5)).map((e) => (
                  <li key={e.rowIndex}>
                    Row {e.rowIndex + 2}: {e.message}
                  </li>
                ))}
              </ul>
              {conversion.errors.length > 5 && (
                <button className="mt-1 underline" onClick={() => setShowAllErrors((s) => !s)}>
                  {showAllErrors ? 'Show fewer' : `Show all ${conversion.errors.length}`}
                </button>
              )}
            </div>
          )}
        </Card>

        {mappingErrors.length > 0 && (
          <ul className="list-inside list-disc text-sm text-red-600 dark:text-red-400">
            {mappingErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onBack}>
            Back
          </button>
          <button className="btn-primary" onClick={doImport} disabled={importing || mappingErrors.length > 0 || conversion.rows.length === 0}>
            {importing ? 'Importing…' : `Import ${conversion.rows.length} transactions`}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportDone({ summary, onReset }: { summary: ImportSummary; onReset: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center py-6 text-center">
        <CheckCircle2 size={40} className="mb-3 text-emerald-500" />
        <h2 className="text-lg font-semibold">Import complete</h2>
        <div className="mt-4 grid grid-cols-3 gap-6">
          <div>
            <div className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{summary.newCount}</div>
            <div className="text-xs text-slate-500">new</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{summary.duplicateCount}</div>
            <div className="text-xs text-slate-500">duplicates skipped</div>
          </div>
          <div>
            <div className={`text-2xl font-semibold ${summary.errorCount ? 'text-amber-600' : ''}`}>{summary.errorCount}</div>
            <div className="text-xs text-slate-500">errors</div>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          {summary.categorizedCount} of {summary.newCount} new transactions were categorized by your rules.
        </p>
        <div className="mt-6 flex gap-2">
          <button className="btn-secondary" onClick={onReset}>
            Import another file
          </button>
          <Link to="/transactions" className="btn-primary">
            View transactions
          </Link>
        </div>
      </div>
    </Card>
  );
}
