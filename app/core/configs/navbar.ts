import { ChartPie, GraduationCap, FileText, Inbox, Users, View, Settings } from 'lucide-vue-next'

interface MenuItem {
    title: string
    url: string
    icon:
        | typeof ChartPie
        | typeof GraduationCap
        | typeof FileText
        | typeof Inbox
        | typeof Users
        | typeof View
        | typeof Settings
    subMenu?: MenuItem[]
}

export const menuItems: MenuItem[] = [
    {
        title: 'Dashboard',
        url: '/dashboard',
        icon: ChartPie,
    },
    {
        title: 'Classes',
        url: '/classes',
        icon: GraduationCap,
    },
    {
        title: 'Assignments',
        url: '/assignments',
        icon: FileText,
    },
    {
        title: 'Submissions',
        url: '/submissions',
        icon: Inbox,
    },
    {
        title: 'Students',
        url: '/students',
        icon: Users,
    },
    {
        title: 'Image Detection',
        url: '/image-detection',
        icon: View,
    },
    {
        title: 'Settings',
        url: '/settings',
        icon: Settings,
    },
]
