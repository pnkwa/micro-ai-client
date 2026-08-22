import { ChartPie, GraduationCap, View, Layers, ShieldCheck } from '@lucide/vue'

/**
 * Who sees an item. `instructor` means any staff account; `admin` is the narrower staff role that
 * also gates /admin in auth.global.ts, so the two rules have to agree or the sidebar offers a
 * route the guard then bounces.
 */
type MenuRole = 'instructor' | 'all' | 'student' | 'admin'

interface MenuItem {
    title: string
    url: string
    icon: typeof ChartPie | typeof GraduationCap | typeof View | typeof Layers | typeof ShieldCheck
    subMenu?: MenuItem[]
    role: MenuRole
}

export const menuItems: MenuItem[] = [
    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: ChartPie,
        role: 'instructor',
    },
    {
        title: 'Classes',
        url: '/classes',
        icon: GraduationCap,
        role: 'instructor',
    },
    {
        title: 'My Classes',
        url: '/classes',
        icon: GraduationCap,
        role: 'student',
    },
    {
        title: 'Image Detection',
        url: '/image-detection',
        icon: View,
        role: 'all',
    },
    {
        title: 'Slide Library',
        url: '/slide-collections',
        icon: Layers,
        role: 'instructor',
    },
    // Last, and only for an admin: account creation and the runtime switches in system_config
    // (BE-ADR-021) are not part of anyone's teaching day.
    {
        title: 'Admin',
        url: '/admin',
        icon: ShieldCheck,
        role: 'admin',
    },
]
