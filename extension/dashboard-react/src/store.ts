import { useState, useCallback } from "react";
import {
  fetchProjects,
  fetchClips,
  deleteClip as apiDeleteClip,
  updateClip as apiUpdateClip,
  createProject as apiCreateProject,
  deleteProject as apiDeleteProject,
  type Clip,
  type Project,
} from "./lib/api";

export function useStore() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [allClips, setAllClips] = useState<Clip[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
    } catch (e: any) {
      console.error("Failed to load projects:", e);
    }
  }, []);

  const loadClips = useCallback(
    async (projectId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const pid = projectId ?? currentProjectId;
        const data = await fetchClips(pid === "all" ? undefined : pid);
        setAllClips(data.clips || []);
      } catch (e: any) {
        if (e.message === "AUTH_REQUIRED") {
          setError("AUTH_REQUIRED");
        } else {
          setError("Failed to connect to backend. Is it running?");
        }
      } finally {
        setLoading(false);
      }
    },
    [currentProjectId]
  );

  const selectProject = useCallback(
    async (id: string) => {
      setCurrentProjectId(id);
      await loadClips(id);
    },
    [loadClips]
  );

  const removeClip = useCallback(
    async (id: string) => {
      await apiDeleteClip(id);
      setAllClips((prev) => prev.filter((c) => c.id !== id));
      await loadProjects();
    },
    [loadProjects]
  );

  const editClip = useCallback(
    async (id: string, text: string) => {
      const clip = allClips.find((c) => c.id === id);
      if (!clip) return;
      await apiUpdateClip(id, text, clip.url);
      setAllClips((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, text, word_count: text.split(/\s+/).length }
            : c
        )
      );
    },
    [allClips]
  );

  const addProject = useCallback(
    async (name: string, description?: string) => {
      await apiCreateProject(name, description);
      await loadProjects();
    },
    [loadProjects]
  );

  const removeProject = useCallback(
    async (id: string) => {
      await apiDeleteProject(id);
      if (currentProjectId === id) {
        setCurrentProjectId("all");
        await loadClips("all");
      }
      await loadProjects();
    },
    [currentProjectId, loadClips, loadProjects]
  );

  const init = useCallback(async () => {
    await Promise.all([loadProjects(), loadClips()]);
  }, [loadProjects, loadClips]);

  return {
    projects,
    allClips,
    currentProjectId,
    loading,
    error,
    init,
    loadProjects,
    loadClips,
    selectProject,
    removeClip,
    editClip,
    addProject,
    removeProject,
  };
}
