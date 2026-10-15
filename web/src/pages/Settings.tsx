import { AI_MODELS, settingsPatchSchema, type Settings } from '@prioritize/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useToast } from '../components/ui';
import { api, ApiFail } from '../lib/api';
import { useSettings } from '../lib/queries';

export default function SettingsPage() {
  const { data } = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [domain, setDomain] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (data) setDomain(data.allowed_domain); }, [data?.allowed_domain]);

  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api<Settings>('/settings', { method: 'PATCH', body: settingsPatchSchema.parse(patch) }),
    onSuccess: (s) => { qc.setQueryData(['settings'], s); setErr(''); toast('Settings saved'); },
    onError: (e) => { if (e instanceof ApiFail) setErr(e.fieldErrors().allowed_domain ?? e.message); toast(e.message, 'error'); },
  });
  if (!data) return <p className="p-8 text-muted">Loading…</p>;
  return (
    <div className="max-w-2xl w-full mx-auto p-8 space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="rounded-lg border border-line bg-surface p-5 space-y-5">
        <div>
          <label className="label" htmlFor="ai_model">AI model</label>
          <select id="ai_model" className="input max-w-xs" value={data.ai_model} onChange={(e) => save.mutate({ ai_model: e.target.value as Settings['ai_model'] })}>
            {AI_MODELS.map((m) => <option key={m}>{m}</option>)}
          </select>
          <p className="help">Used for the next "Ask AI to prioritize" click.</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" role="switch" checked={data.ice_box_resets_priority} onChange={(e) => save.mutate({ ice_box_resets_priority: e.target.checked })} />
            Reset priority when a card moves to Ice Box
          </label>
          <p className="help">Off (default): Ice Box cards keep their priority.</p>
        </div>
        <div>
          <label className="label" htmlFor="allowed_domain">Allowed sign-in domain</label>
          <div className="flex gap-2 max-w-md">
            <input id="allowed_domain" className="input" placeholder="example.com (empty = any Google account)" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <button className="btn" disabled={domain === data.allowed_domain || save.isPending} onClick={() => save.mutate({ allowed_domain: domain })}>Save</button>
          </div>
          {err && <p className="err">{err}</p>}
          <p className="help">When set, the Google account's hosted domain must match. Existing sessions stay valid.</p>
        </div>
      </div>
    </div>
  );
}
