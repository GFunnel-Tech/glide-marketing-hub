import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export interface Workspace {
  id: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (ws: Workspace) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  loading: true,
  refresh: async () => {},
});

const STORAGE_KEY = "emm-current-workspace";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWorkspaces = async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceState(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("workspace_members")
      .select("role, workspaces:workspace_id(id, name)")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to load workspaces", error);
      setLoading(false);
      return;
    }

    const list: Workspace[] = (data || [])
      .map((row: any) => row.workspaces ? {
        id: row.workspaces.id,
        name: row.workspaces.name,
        role: row.role,
      } : null)
      .filter(Boolean) as Workspace[];

    setWorkspaces(list);

    const stored = localStorage.getItem(STORAGE_KEY);
    const found = stored ? list.find((w) => w.id === stored) : null;
    setCurrentWorkspaceState(found || list[0] || null);
    setLoading(false);
  };

  useEffect(() => { loadWorkspaces(); }, [user]);

  const setCurrentWorkspace = (ws: Workspace) => {
    setCurrentWorkspaceState(ws);
    localStorage.setItem(STORAGE_KEY, ws.id);
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces, currentWorkspace, setCurrentWorkspace, loading, refresh: loadWorkspaces,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
