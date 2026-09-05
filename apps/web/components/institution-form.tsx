"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button, Field, InlineNotice, Input, Select, Textarea } from "@/components/ui/primitives";

export type Institution = {
  id: string;
  code: string;
  legalName: string;
  displayName: string;
  institutionType: string;
  registrationNumber: string | null;
  status: string;
  stateId: string;
  stateCode: string;
  stateName: string;
  districtId: string;
  districtCode: string;
  districtName: string;
  address: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  primaryContactName: string;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  verificationStatus: string;
  createdAt: string;
  updatedAt: string;
};

export type InstitutionPayload = {
  code: string;
  legalName: string;
  displayName: string;
  institutionType: string;
  registrationNumber: string | null;
  status: string;
  stateId: string;
  districtId: string;
  address: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  primaryContactName: string;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  verificationStatus: string;
};

type State = { id: string; code: string; name: string };
type District = { id: string; stateId: string; code: string; name: string };

type FormState = {
  code: string;
  legalName: string;
  displayName: string;
  institutionType: string;
  registrationNumber: string;
  status: string;
  stateId: string;
  districtId: string;
  address: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  geofenceRadiusM: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  verificationStatus: string;
};

const empty: FormState = {
  code: "",
  legalName: "",
  displayName: "",
  institutionType: "",
  registrationNumber: "",
  status: "",
  stateId: "",
  districtId: "",
  address: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  geofenceRadiusM: "100",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactPhone: "",
  verificationStatus: "",
};

function initialState(value?: Institution | null): FormState {
  if (!value) return empty;
  return {
    code: value.code,
    legalName: value.legalName,
    displayName: value.displayName,
    institutionType: value.institutionType,
    registrationNumber: value.registrationNumber ?? "",
    status: value.status,
    stateId: value.stateId,
    districtId: value.districtId,
    address: value.address,
    postalCode: value.postalCode,
    latitude: String(value.latitude),
    longitude: String(value.longitude),
    geofenceRadiusM: String(value.geofenceRadiusM),
    primaryContactName: value.primaryContactName,
    primaryContactEmail: value.primaryContactEmail ?? "",
    primaryContactPhone: value.primaryContactPhone ?? "",
    verificationStatus: value.verificationStatus,
  };
}

async function responseMessage(response: Response) {
  try {
    const body = (await response.json()) as { title?: string };
    return body.title || `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}

export function InstitutionForm({
  value,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  value?: Institution | null;
  busy?: boolean;
  submitLabel: string;
  onSubmit: (payload: InstitutionPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const { request } = useAuth();
  const [form, setForm] = useState<FormState>(() => initialState(value));
  const [states, setStates] = useState<State[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [geographyError, setGeographyError] = useState<string | null>(null);

  useEffect(() => setForm(initialState(value)), [value]);

  useEffect(() => {
    let cancelled = false;
    void request("/api/v1/geography/states")
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const body = (await response.json()) as State[];
        if (!cancelled) {
          setStates(body);
          setGeographyError(null);
        }
      })
      .catch((reason) => {
        if (!cancelled) setGeographyError(reason instanceof Error ? reason.message : "Unable to load canonical states");
      });
    return () => {
      cancelled = true;
    };
  }, [request]);

  useEffect(() => {
    if (!form.stateId) {
      setDistricts([]);
      return;
    }
    let cancelled = false;
    void request(`/api/v1/geography/states/${form.stateId}/districts`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const body = (await response.json()) as District[];
        if (!cancelled) setDistricts(body);
      })
      .catch((reason) => {
        if (!cancelled) setGeographyError(reason instanceof Error ? reason.message : "Unable to load canonical districts");
      });
    return () => {
      cancelled = true;
    };
  }, [form.stateId, request]);

  const geographyMissing = useMemo(() => !geographyError && states.length === 0, [geographyError, states.length]);

  function set<K extends keyof FormState>(key: K, next: FormState[K]) {
    setForm((current) => ({ ...current, [key]: next }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    const geofenceRadiusM = Number(form.geofenceRadiusM);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isInteger(geofenceRadiusM)) return;
    await onSubmit({
      code: form.code,
      legalName: form.legalName,
      displayName: form.displayName,
      institutionType: form.institutionType,
      registrationNumber: form.registrationNumber.trim() || null,
      status: form.status,
      stateId: form.stateId,
      districtId: form.districtId,
      address: form.address,
      postalCode: form.postalCode,
      latitude,
      longitude,
      geofenceRadiusM,
      primaryContactName: form.primaryContactName,
      primaryContactEmail: form.primaryContactEmail.trim() || null,
      primaryContactPhone: form.primaryContactPhone.trim() || null,
      verificationStatus: form.verificationStatus,
    });
  }

  return (
    <form className="nx-institution-form" onSubmit={submit}>
      {geographyError ? <InlineNotice tone="danger" title="Geography unavailable">{geographyError}</InlineNotice> : null}
      {geographyMissing ? (
        <InlineNotice tone="info" title="Canonical geography is empty">
          No official state/district records are loaded. NirikshanX does not invent production geography; load the approved catalog before creating an institution.
        </InlineNotice>
      ) : null}

      <div className="nx-form-grid">
        <Field label="Institution code" htmlFor="institution-code" hint="Canonical uppercase identifier; unique across NirikshanX.">
          <Input id="institution-code" value={form.code} onChange={(event) => set("code", event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Registration number" htmlFor="registration-number" hint="Optional until the authoritative source provides one.">
          <Input id="registration-number" value={form.registrationNumber} onChange={(event) => set("registrationNumber", event.target.value)} maxLength={120} />
        </Field>
        <Field label="Legal name" htmlFor="legal-name">
          <Input id="legal-name" value={form.legalName} onChange={(event) => set("legalName", event.target.value)} maxLength={240} required />
        </Field>
        <Field label="Display name" htmlFor="display-name">
          <Input id="display-name" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} maxLength={200} required />
        </Field>
        <Field label="Institution type code" htmlFor="institution-type" hint="Use the approved policy code. The application deliberately does not invent a closed taxonomy.">
          <Input id="institution-type" value={form.institutionType} onChange={(event) => set("institutionType", event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Status code" htmlFor="institution-status" hint="Use the authoritative lifecycle/status code supplied by policy.">
          <Input id="institution-status" value={form.status} onChange={(event) => set("status", event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Verification status code" htmlFor="verification-status" hint="A normalized policy code; no unsupported verification claim is generated by the UI.">
          <Input id="verification-status" value={form.verificationStatus} onChange={(event) => set("verificationStatus", event.target.value.toUpperCase())} maxLength={64} required />
        </Field>
        <Field label="Postal code" htmlFor="postal-code">
          <Input id="postal-code" value={form.postalCode} onChange={(event) => set("postalCode", event.target.value)} maxLength={20} required />
        </Field>
        <Field label="State" htmlFor="institution-state">
          <Select
            id="institution-state"
            value={form.stateId}
            onChange={(event) => setForm((current) => ({ ...current, stateId: event.target.value, districtId: "" }))}
            required
            disabled={states.length === 0}
          >
            <option value="">Select canonical state</option>
            {states.map((state) => <option value={state.id} key={state.id}>{state.name} · {state.code}</option>)}
          </Select>
        </Field>
        <Field label="District" htmlFor="institution-district">
          <Select id="institution-district" value={form.districtId} onChange={(event) => set("districtId", event.target.value)} required disabled={!form.stateId || districts.length === 0}>
            <option value="">Select canonical district</option>
            {districts.map((district) => <option value={district.id} key={district.id}>{district.name} · {district.code}</option>)}
          </Select>
        </Field>
      </div>

      <Field label="Address" htmlFor="institution-address">
        <Textarea id="institution-address" value={form.address} onChange={(event) => set("address", event.target.value)} maxLength={500} required />
      </Field>

      <div className="nx-form-grid nx-form-grid--three">
        <Field label="Latitude" htmlFor="institution-latitude" hint="WGS84, -90 to 90.">
          <Input id="institution-latitude" type="number" step="any" min={-90} max={90} value={form.latitude} onChange={(event) => set("latitude", event.target.value)} required />
        </Field>
        <Field label="Longitude" htmlFor="institution-longitude" hint="WGS84, -180 to 180.">
          <Input id="institution-longitude" type="number" step="any" min={-180} max={180} value={form.longitude} onChange={(event) => set("longitude", event.target.value)} required />
        </Field>
        <Field label="Geofence radius (m)" htmlFor="institution-geofence">
          <Input id="institution-geofence" type="number" min={1} step={1} value={form.geofenceRadiusM} onChange={(event) => set("geofenceRadiusM", event.target.value)} required />
        </Field>
      </div>

      <div className="nx-form-grid">
        <Field label="Primary contact name" htmlFor="primary-contact-name">
          <Input id="primary-contact-name" value={form.primaryContactName} onChange={(event) => set("primaryContactName", event.target.value)} maxLength={160} required />
        </Field>
        <Field label="Primary contact email" htmlFor="primary-contact-email">
          <Input id="primary-contact-email" type="email" value={form.primaryContactEmail} onChange={(event) => set("primaryContactEmail", event.target.value)} maxLength={320} />
        </Field>
        <Field label="Primary contact phone" htmlFor="primary-contact-phone">
          <Input id="primary-contact-phone" value={form.primaryContactPhone} onChange={(event) => set("primaryContactPhone", event.target.value)} maxLength={32} />
        </Field>
      </div>

      <div className="nx-form-actions">
        {onCancel ? <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button> : null}
        <Button type="submit" disabled={busy || states.length === 0}>{busy ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
