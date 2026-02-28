<script setup lang="ts">
import { useBreadcrumb } from '~/core/store/useBreadcrumb'

const breadcrumb = useBreadcrumb()
const { open, isMobile } = useSidebar()
</script>

<template>
    <main
        :class="[
            cn(
                'tw:relative tw:w-full tw:flex tw:min-h-svh tw:flex-1 tw:flex-col tw:bg-background tw:peer-data-[variant=inset]:min-h-[calc(100svh-(--spacing(4)))] tw:md:peer-data-[variant=inset]:m-2 tw:md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 tw:md:peer-data-[variant=inset]:ml-0 tw:md:peer-data-[variant=inset]:rounded-xl tw:md:peer-data-[variant=inset]:shadow',
            ),
            !isMobile && open && 'tw:max-w-[calc(100vw-var(--sidebar-width)-12px)]',
        ]"
    >
        <header
            class="tw:flex tw:items-center tw:justify-between tw:bg-white tw:px-4 tw:min-h-16 tw:shadow tw:border-b"
        >
            <div class="tw:flex tw:items-center tw:flex-wrap tw:gap-0 tw:lg:gap-4">
                <div class="tw:flex tw:items-center tw:gap-2">
                    <McSidebarTrigger />
                    <span class="tw:font-bold tw:text-xl">Hello</span>
                </div>

                <McBreadcrumb v-if="breadcrumb.items.length > 0">
                    <McBreadcrumbList>
                        <McBreadcrumbItem
                            v-for="(value, index) in breadcrumb.items"
                            :key="`breadcrumb-${index}`"
                        >
                            <McBreadcrumbLink as-child>
                                <RouterLink v-if="value.to" :to="value.to">
                                    {{ value.label }}
                                </RouterLink>
                                <span v-else>{{ value.label }}</span>
                            </McBreadcrumbLink>
                            <McBreadcrumbSeparator v-if="index < breadcrumb.items.length - 1" />
                        </McBreadcrumbItem>
                    </McBreadcrumbList>
                </McBreadcrumb>
            </div>
        </header>
        <div class="tw:min-h-[calc(100vh-65px)] tw:bg-[#f9f9f9]">
            <div class="tw:container tw:mx-auto tw:p-4">
                <slot />
            </div>
        </div>
    </main>
</template>
