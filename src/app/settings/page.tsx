"use client";

import { SettingsForm } from "@/components/settings-form";
import { useGoldbitStore } from "@/lib/local-store";

export default function SettingsPage() {
  const { strategy, closeRecords, feeRatePercent, updateStrategy, resetState } =
    useGoldbitStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="mt-1 text-muted-foreground">Configure the local SOXL strategy baseline for GoldOrbit.</p>
      </div>
      <SettingsForm
        strategy={strategy}
        closeRecords={closeRecords}
        feeRatePercent={feeRatePercent}
        onSave={updateStrategy}
        onReset={resetState}
      />
    </div>
  );
}
