import { useEffect } from 'react';
import { create } from 'zustand';
import { getSupabase } from '../lib/supabase';
import { IS_APP } from '../lib/edition';
import { api } from './api';
import { useAccount } from './account';

/**
 * Rollen der aktiven Lerngruppe: Lernprofil (members.id) → Konto + Rolle.
 * In der App sind „Personen“ echte Konten; nur der Inhaber verwaltet die Gruppe.
 */
interface RoleState {
  groupId: string | null;
  byMember: Record<string, { userId: string; role: 'owner' | 'member' }>;
}
const useRoles = create<RoleState>(() => ({ groupId: null, byMember: {} }));

export async function reloadGroupRoles() {
  const me = useAccount.getState().me;
  const gid = me?.active_group_id ?? null;
  if (!IS_APP || !gid) return;
  try {
    const list = await api.groupMembers(getSupabase(), gid);
    useRoles.setState({ groupId: gid, byMember: Object.fromEntries(list.map((m) => [m.member_id, { userId: m.user_id, role: m.role }])) });
  } catch {
    /* ohne Rollen: Anzeige ohne Inhaber-Kennzeichnung */
  }
}

export function useGroupRoles() {
  const gid = useAccount((s) => s.me?.active_group_id ?? null);
  const state = useRoles();
  useEffect(() => {
    if (IS_APP && gid && state.groupId !== gid) void reloadGroupRoles();
  }, [gid, state.groupId]);
  const me = useAccount((s) => s.me);
  const group = me?.groups.find((g) => g.id === me.active_group_id);
  return {
    byMember: state.byMember,
    isOwner: !!group?.is_owner,
    myUserId: me?.user_id ?? null,
    groupId: gid,
  };
}
