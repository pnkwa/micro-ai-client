import { ChartPie, GraduationCap, View, Layers, Dumbbell } from 'lucide-vue-next'

type MenuRole = 'instructor' | 'all' | 'student'

interface MenuItem {
    title: string
    url: string
    icon: typeof ChartPie | typeof GraduationCap | typeof View | typeof Layers | typeof Dumbbell
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
        title: 'Practice',
        url: '/practice',
        icon: Dumbbell,
        role: 'all',
    },
    // Students reach this in practice only. That rule is enforced SERVER-SIDE - POST /detections
    // 403s a student with an exam open (BE-ADR-012, request 5.2) - because a hidden nav item has
    // never stopped anyone typing a URL, and the labels here are the diagnosis.
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
]
