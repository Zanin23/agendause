import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type PermissionAction = 'read' | 'write' | 'delete' | 'admin';

export const usePermissions = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [screenPermissions, setScreenPermissions] = useState<{ screen: string; actions: string[] }[]>([]);
  const [schedulePermissions, setSchedulePermissions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user) {
      setIsAdmin(false);
      setScreenPermissions([]);
      setSchedulePermissions({});
      setLoading(false);
      return;
    }

    setLoading(true);
    supabase
      .from("user_roles")
      .select("role, screen_permissions, schedule_permissions")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (!active) return;
        
        const roles = data || [];
        const isSystemAdmin = roles.some(r => r.role === 'admin');
        setIsAdmin(isSystemAdmin);
        
        // Combine permissions if user has multiple roles (though usually only one)
        const screens: { screen: string; actions: string[] }[] = [];
        const schedules: Record<string, string> = {};
        
        roles.forEach(r => {
          if (r.screen_permissions) {
            (r.screen_permissions as any[]).forEach(p => {
              const existing = screens.find(s => s.screen === p.screen);
              if (existing) {
                existing.actions = Array.from(new Set([...existing.actions, ...p.actions]));
              } else {
                screens.push({ ...p });
              }
            });
          }
          if (r.schedule_permissions) {
            Object.entries(r.schedule_permissions as Record<string, string>).forEach(([id, perm]) => {
              if (perm === 'write' || !schedules[id]) {
                schedules[id] = perm;
              }
            });
          }
        });
        
        setScreenPermissions(screens);
        setSchedulePermissions(schedules);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const hasScreenPermission = (screen: string, action: string = 'read') => {
    if (isAdmin) return true;
    const perm = screenPermissions.find(p => p.screen === screen);
    if (!perm) return false;
    return perm.actions.includes(action);
  };

  const hasSchedulePermission = (scheduleId: string, action: string = 'read') => {
    if (isAdmin) return true;
    
    // Check if user has general 'schedules' screen permission
    if (hasScreenPermission('schedules', action)) return true;
    
    const perm = schedulePermissions[scheduleId];
    if (!perm) return false;
    
    if (action === 'read') return perm === 'read' || perm === 'write';
    if (action === 'write') return perm === 'write';
    
    return false;
  };

  return {
    isAdmin,
    screenPermissions,
    schedulePermissions,
    loading,
    hasScreenPermission,
    hasSchedulePermission
  };
};
