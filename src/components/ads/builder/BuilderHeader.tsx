import { ChevronLeft, Save, Eye, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAdDraftStore } from "@/stores/adDraftStore";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  saving?: boolean;
  saved?: boolean;
  onSave: () => void;
  onReview: () => void;
}

export function BuilderHeader({ saving, saved, onSave, onReview }: Props) {
  const navigate = useNavigate();
  const draftName = useAdDraftStore((s) => s.state.draftName);
  const setDraftName = useAdDraftStore((s) => s.setDraftName);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(draftName);

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 sticky top-0 z-30">
      <button
        onClick={() => navigate("/ads")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex-1 flex items-center justify-center">
        {editing ? (
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={() => { setDraftName(val.trim() || "Untitled Campaign"); setEditing(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { setDraftName(val.trim() || "Untitled Campaign"); setEditing(false); }
              if (e.key === "Escape") { setVal(draftName); setEditing(false); }
            }}
            className="text-sm font-semibold bg-transparent border-b border-primary outline-none text-center min-w-[280px] max-w-[60vw]"
          />
        ) : (
          <button
            onClick={() => { setVal(draftName); setEditing(true); }}
            className="text-sm font-semibold text-foreground hover:bg-accent rounded px-2 py-1 truncate max-w-[60vw]"
            title="Click to rename"
          >
            {draftName}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {saving ? (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </span>
        ) : saved ? (
          <span className="text-[11px] text-muted-foreground">Saved</span>
        ) : null}
        <Button variant="outline" size="sm" onClick={onSave} className="h-8">
          <Save className="h-3.5 w-3.5 mr-1.5" /> Save
        </Button>
        <Button size="sm" onClick={onReview} className="h-8 bg-primary text-primary-foreground">
          <Eye className="h-3.5 w-3.5 mr-1.5" /> Review
        </Button>
      </div>
    </header>
  );
}
