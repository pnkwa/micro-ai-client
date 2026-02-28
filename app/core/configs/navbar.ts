import { ChartPie, Hospital } from 'lucide-vue-next'

interface MenuItem {
    title: string
    url: string
    icon: typeof Hospital
    subMenu?: MenuItem[]
}

export const menuItems: MenuItem[] = [
    {
        title: 'Dashboard',
        url: '/',
        icon: ChartPie,
    },
    {
        title: 'โรงพยาบาล',
        url: '/hospital',
        icon: Hospital,
    },
]
