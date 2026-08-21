import { Microscope, Search, Users, TrendingUp, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";

const areas = [
  {
    icon: Search,
    label: "Competitor Ad Library",
    hint: "Pull live creatives competitors are running in your verticals.",
  },
  {
    icon: TrendingUp,
    label: "Market & Rate Trends",
    hint: "Seasonality, CPM pressure and rate movement affecting spend.",
  },
  {
    icon: Users,
    label: "Audience Insights",
    hint: "Segment performance across geo, age and interest cohorts.",
  },
];

export default function Research() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Microscope className="h-5 w-5 text-primary" />
          Research
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Market, competitor and audience intelligence feeding your launch decisions.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => {
          const Icon = area.icon;
          return (
            <Card key={area.label} className="p-5 rounded-xl relative overflow-hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-3 text-sm font-semibold flex items-center gap-2">
                {area.label}
                <span className="text-[10px] uppercase tracking-wide bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-medium leading-none">
                  Coming Soon
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">{area.hint}</p>
              <Lock className="absolute top-4 right-4 h-3.5 w-3.5 text-muted-foreground/60" />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
