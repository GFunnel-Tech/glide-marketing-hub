import { useAdDraftStore } from "@/stores/adDraftStore";
import { Section } from "../shared/Section";
import { Target, Info } from "lucide-react";
import { InterestAutocomplete } from "../shared/InterestAutocomplete";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";

export function TargetingSection() {
  const state = useAdDraftStore((s) => s.state);
  const patch = useAdDraftStore((s) => s.patch);
  const specialOn = !!state.specialAdCategory;

  return (
    <Section title="Targeting" icon={<Target className="h-4 w-4 text-primary" />}>
      {specialOn && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-foreground flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-medium capitalize">{state.specialAdCategory}</span> Special Ad Category detected. Age, gender & detailed location targeting are restricted by Meta.
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Locations</label>
        <div className="flex flex-wrap gap-1.5">
          {state.countries.map((c) => (
            <span key={c} className="inline-block bg-primary/10 text-primary rounded px-2 py-1 text-xs">📍 {c === "US" ? "United States" : c}</span>
          ))}
        </div>
      </div>

      {!specialOn && (
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Age: {state.ageMin} – {state.ageMax}</label>
          <Slider
            value={[state.ageMin, state.ageMax]} min={13} max={65} step={1}
            onValueChange={(v) => { patch("ageMin", v[0]); patch("ageMax", v[1]); }}
          />
        </div>
      )}

      {!specialOn && (
        <div>
          <label className="text-xs font-medium text-foreground mb-1.5 block">Gender</label>
          <div className="flex gap-2">
            {(["all", "male", "female"] as const).map((g) => (
              <button
                key={g}
                onClick={() => patch("genders", [g])}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  state.genders[0] === g ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Detailed Interests</label>
        <InterestAutocomplete value={state.interests} onChange={(v) => patch("interests", v)} />
      </div>

      <div>
        <label className="text-xs font-medium text-foreground mb-1.5 block">Placements</label>
        <div className="flex gap-2">
          {([
            { v: "advantage_plus", l: "Advantage+ Placements" },
            { v: "manual", l: "Manual" },
          ] as const).map((p) => (
            <button
              key={p.v}
              onClick={() => patch("placements", p.v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                state.placements === p.v ? "bg-primary text-primary-foreground" : "bg-accent text-muted-foreground hover:text-foreground",
              )}
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}
