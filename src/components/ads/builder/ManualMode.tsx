import { IdentitySection } from "./sections/IdentitySection";
import { LeadFormSection } from "./sections/LeadFormSection";
import { CreativeSection } from "./sections/CreativeSection";
import { TargetingSection } from "./sections/TargetingSection";
import { BudgetSection } from "./sections/BudgetSection";
import { OptionalSection } from "./sections/OptionalSection";

export function ManualMode() {
  return (
    <div className="space-y-4">
      <IdentitySection />
      <LeadFormSection />
      <CreativeSection />
      <TargetingSection />
      <BudgetSection />
      <OptionalSection />
    </div>
  );
}
