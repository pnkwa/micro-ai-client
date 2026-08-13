<script setup lang="ts">
import type { FunctionalComponent } from 'vue'
import {
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubItem,
} from '@/core/components/ui/sidebar'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/core/components/ui/collapsible'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/core/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/core/components/ui/tooltip'
import { ChevronDown, Lock } from '@lucide/vue'
import SidebarButton from './SidebarButton.vue'

interface SidebarItemProps {
    item: {
        title: string
        icon?: FunctionalComponent
        url: string
        subMenu?: SidebarItemProps['item'][]
    }
    disabled?: boolean
    disabledReason?: string
}

const props = defineProps<SidebarItemProps>()

const router = useRouter()
const route = useRoute()
const { isMobile, setOpenMobile, open } = useSidebar()

const isPathStartWith = (url: string) => {
    if (url === '/' && route.path === '/') {
        return true
    }

    const regexUrl = new RegExp(`^${url}(/|$)`)

    return url !== '/' && regexUrl.test(route.path)
}
</script>

<template>
    <div>
        <SidebarMenuItem v-if="!props.item.subMenu" :key="props.item.title" :item="props.item">
            <Tooltip v-if="props.disabled">
                <TooltipTrigger as-child>
                    <div class="tw:w-full tw:cursor-not-allowed">
                        <SidebarMenuButton
                            aria-disabled="true"
                            class="tw:pointer-events-none tw:opacity-50"
                        >
                            <component :is="item.icon" class="tw:w-5! tw:h-5! tw:shrink-0" />
                            <span
                                class="tw:group-data-[collapsible=icon]:hidden tw:text-base tw:truncate"
                            >
                                {{ item.title }}
                            </span>
                            <Lock
                                class="tw:ml-auto tw:size-3.5 tw:shrink-0 tw:group-data-[collapsible=icon]:hidden"
                            />
                        </SidebarMenuButton>
                    </div>
                </TooltipTrigger>
                <TooltipContent side="right" align="center" class="tw:max-w-64">
                    {{ props.disabledReason }}
                </TooltipContent>
            </Tooltip>

            <SidebarButton
                v-else
                :is-active="item.url ? isPathStartWith(item.url) : false"
                :icon="item.icon"
                :title="item.title"
                @click="
                    () => {
                        if (item.url) {
                            router.push(item.url)
                        }
                        if (isMobile) {
                            setOpenMobile(false)
                        }
                    }
                "
            />
        </SidebarMenuItem>
        <template v-else>
            <Collapsible
                v-if="open"
                :default-open="isPathStartWith(item.url)"
                class="tw:group/collapsible"
            >
                <SidebarMenuItem>
                    <CollapsibleTrigger as-child>
                        <SidebarMenuButton>
                            <component :is="item.icon" class="tw:w-5! tw:h-5! tw:shrink-0" />
                            <span class="tw:group-data-[collapsible=icon]:hidden tw:text-base">
                                {{ item.title }}
                            </span>
                            <ChevronDown
                                class="tw:ml-auto tw:transition-transform tw:group-data-[state=open]/collapsible:rotate-180"
                            />
                        </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <SidebarMenuSub>
                            <SidebarMenuSubItem
                                v-for="(value, index) in props.item.subMenu"
                                :key="index"
                            >
                                <SidebarButton
                                    :is-active="isPathStartWith(value.url)"
                                    :title="value.title"
                                    @click="
                                        () => {
                                            router.push(value.url)
                                        }
                                    "
                                />
                            </SidebarMenuSubItem>
                        </SidebarMenuSub>
                    </CollapsibleContent>
                </SidebarMenuItem>
            </Collapsible>
            <SidebarMenuItem v-else :key="props.item.title" :item="props.item">
                <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                        <SidebarMenuButton
                            :is-active="item.url ? isPathStartWith(item.url) : false"
                        >
                            <component :is="item.icon" class="tw:w-5! tw:h-5! tw:shrink-0" />
                            <span class="tw:group-data-[collapsible=icon]:hidden">
                                {{ item.title }}
                            </span>
                            <ChevronDown
                                class="tw:ml-auto tw:transition-transform tw:group-data-[state=open]/sidebar-menu-btn:rotate-180"
                            />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start">
                        <DropdownMenuItem
                            v-for="(value, index) in props.item.subMenu"
                            :key="index"
                            :class="[
                                isPathStartWith(value.url)
                                    ? 'tw:bg-[#2b3b8e33] tw:text-primary tw:hover:bg-[#2b3b8e33]!'
                                    : '',
                            ]"
                            @click="
                                () => {
                                    router.push(value.url)
                                }
                            "
                        >
                            <span>{{ value.title }}</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </template>
    </div>
</template>
