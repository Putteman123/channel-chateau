import { Home, Tv, Film, PlayCircle, Heart, History, Settings, LogOut, Plus, Layers, Shield } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { useStream } from '@/contexts/StreamContext';
import faviconImg from '/favicon.png';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const mainNavItems = [
  { titleKey: 'nav.browse', url: '/browse', icon: Home },
  { titleKey: 'nav.liveTV', url: '/live', icon: Tv },
  { titleKey: 'nav.movies', url: '/movies', icon: Film },
  { titleKey: 'nav.series', url: '/series', icon: PlayCircle },
  { titleKey: 'nav.streamingHub', url: '/streaming-hub', icon: Layers },
];

const personalNavItems = [
  { titleKey: 'nav.favorites', url: '/favorites', icon: Heart },
  { titleKey: 'nav.continueWatching', url: '/continue', icon: History },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const { state } = useSidebar();
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const { isAdmin } = useAdminCheck();
  const { sources, activeSource } = useStream();
  const collapsed = state === 'collapsed';

  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar collapsible="icon" className="border-r border-border bg-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={faviconImg} alt="Streamify" className="h-10 w-10 rounded-xl shadow-lg shadow-primary/40" />
          {!collapsed && (
            <span className="text-2xl font-bold tracking-tight text-foreground">
              <span className="text-primary">Stream</span>ify
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Stream Source Selector */}
        {sources.length > 0 && !collapsed && (
          <div className="px-4 py-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left">
                  <span className="truncate">{activeSource?.name || t('settings.sources.noSources')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {sources.map((source) => (
                  <DropdownMenuItem key={source.id}>
                    {source.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/settings/sources" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    {t('settings.sources.addSource')}
                  </NavLink>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* No sources warning */}
        {sources.length === 0 && !collapsed && (
          <div className="px-4 py-2">
            <NavLink to="/settings/sources">
              <Button variant="outline" className="w-full gap-2">
                <Plus className="h-4 w-4" />
                {t('browse.addSource')}
              </Button>
            </NavLink>
          </div>
        )}

        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>{t('nav.browse')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={t(item.titleKey)}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Personal */}
        <SidebarGroup>
          <SidebarGroupLabel>{t('favorites.title')}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {personalNavItems.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={t(item.titleKey)}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location.pathname.startsWith('/admin')}
                tooltip="Admin"
              >
                <NavLink to="/admin">
                  <Shield className="h-4 w-4" />
                  <span>Admin</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive('/settings')}
              tooltip={t('nav.settings')}
            >
              <NavLink to="/settings">
                <Settings className="h-4 w-4" />
                <span>{t('nav.settings')}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-3 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.display_name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <span className="truncate text-sm">
                  {profile?.display_name || t('common.unknown')}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <NavLink to="/settings/profile" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t('nav.profile')}
              </NavLink>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
