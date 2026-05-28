import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/form";
import { mockLastFiveCloses, mockStrategy } from "@/lib/mock-data";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Settings</h2>
        <p className="mt-1 text-muted-foreground">Configure the local SOXL strategy baseline for GoldOrbit.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Strategy Defaults</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 xl:grid-cols-4">
            <div>
              <Label>Initial Capital</Label>
              <Input type="number" defaultValue={mockStrategy.initialCapital} />
            </div>
            <div>
              <Label>Division</Label>
              <Select defaultValue={mockStrategy.division}>
                <option value="20">20</option>
                <option value="40">40</option>
              </Select>
            </div>
            <div>
              <Label>Current Cash</Label>
              <Input type="number" defaultValue={mockStrategy.cashBalance} />
            </div>
            <div>
              <Label>Average Price</Label>
              <Input type="number" defaultValue={mockStrategy.averagePrice} />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" defaultValue={mockStrategy.quantity} />
            </div>
            <div>
              <Label>T Value</Label>
              <Input type="number" defaultValue={mockStrategy.tValue} />
            </div>
            <div>
              <Label>Mode</Label>
              <Select defaultValue={mockStrategy.mode}>
                <option value="NORMAL">NORMAL</option>
                <option value="REVERSE">REVERSE</option>
              </Select>
            </div>
            <div>
              <Label>Symbol</Label>
              <Input value="SOXL" readOnly />
            </div>
            {mockLastFiveCloses.map((close, index) => (
              <div key={index}>
                <Label>Close {index + 1}</Label>
                <Input type="number" defaultValue={close} />
              </div>
            ))}
            <div className="flex gap-3 xl:col-span-4">
              <Button>
                <Save className="h-4 w-4" />
                Save Settings
              </Button>
              <Button className="border-red-300/30 bg-red-500/15 text-red-100 hover:bg-red-500/25">
                <RotateCcw className="h-4 w-4" />
                Reset Data
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
