import { ChartPie, GraduationCap, FileText, View, Settings } from 'lucide-vue-next'

type MenuRole = 'instructor' | 'all' | 'student'

interface MenuItem {
    title: string
    url: string
    icon: typeof ChartPie | typeof GraduationCap | typeof FileText | typeof View | typeof Settings
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
        title: 'Assignments',
        url: '/assignments',
        icon: FileText,
        role: 'student',
    },
    {
        title: 'Image Detection',
        url: '/image-detection',
        icon: View,
        role: 'all',
    },
    {
        title: 'Settings',
        url: '/settings',
        icon: Settings,
        role: 'instructor',
    },
]
