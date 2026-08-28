<script setup lang="ts">
import { useBreadcrumb } from '~/core/store/useBreadcrumb'

const breadcrumb = useBreadcrumb()
const { open, isMobile } = useSidebar()

// Phones: the full trail wraps to three or four lines, and because this bar is sticky that
// height is stolen from every screen for the whole session (a 4-crumb trail measured 143px
// of a 667px viewport). Keep the root - so there's still an escape upward - and the current
// page, and collapse whatever sits between them into an ellipsis. Desktop is unchanged.
const crumbs = computed(() => {
    const items = breadcrumb.items
    if (!isMobile.value || items.length <= 2) return items.map((item) => ({ ...item, gap: false }))

    return [
        { ...items[0]!, gap: false },
        { ...items[items.length - 1]!, gap: true },
    ]
})
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
        <!-- Sticky so the breadcrumb/trigger bar stays put as the page scrolls (the window is
             the scroll container - nothing between here and <body> sets overflow). z-30 keeps
             it above page content and any in-page sticky table headers, below dialogs/popovers. -->
        <div
            data-mc-app-bar
            class="tw:sticky tw:top-0 tw:z-30 tw:flex tw:items-center tw:justify-between tw:bg-white tw:px-4 tw:min-h-12 tw:border-b"
        >
            <div
                class="tw:flex tw:items-center tw:min-w-0 tw:flex-nowrap tw:gap-0 tw:lg:gap-4 tw:lg:flex-wrap"
            >
                <!-- The leading half of the same idea as #mc-header-actions: a page's own back-style
                     action, where iOS puts one. Empty and unconditional, so a Teleport into it always
                     finds a target. -->
                <div id="mc-header-lead" class="tw:flex tw:shrink-0 tw:items-center"></div>

                <div class="tw:flex tw:items-center tw:gap-2 tw:shrink-0">
                    <!-- `data-mc-sidebar-trigger` is the handle a page uses to take this out of its
                         bar - see `.mc-hide-sidebar-trigger` in main.css. A full-screen page whose own
                         actions live in the bar does not want the app's navigation interleaved with
                         them. -->
                    <McSidebarTrigger data-mc-sidebar-trigger />
                    <RouterLink v-if="!open && !isMobile" to="/" class="tw:ml-1">
                        <span class="logo-text">MicroAI</span>
                    </RouterLink>
                </div>

                <McBreadcrumb v-if="crumbs.length > 0" class="tw:min-w-0">
                    <McBreadcrumbList class="tw:flex-nowrap tw:lg:flex-wrap">
                        <template v-for="(value, index) in crumbs" :key="`breadcrumb-${index}`">
                            <McBreadcrumbItem v-if="value.gap" class="tw:shrink-0">
                                <McBreadcrumbEllipsis class="tw:size-6" />
                                <McBreadcrumbSeparator />
                            </McBreadcrumbItem>

                            <!-- Only the current page absorbs the squeeze; ancestors hold their
                                 natural width so a short root never renders as "Clas…", but stay
                                 capped so they can't push the row sideways instead. -->
                            <McBreadcrumbItem
                                :class="
                                    index === crumbs.length - 1
                                        ? 'tw:min-w-0'
                                        : 'tw:shrink-0 tw:max-w-32 tw:lg:max-w-none'
                                "
                            >
                                <McBreadcrumbLink as-child class="tw:block tw:min-w-0 tw:truncate">
                                    <RouterLink v-if="value.to" :to="value.to">
                                        {{ value.label }}
                                    </RouterLink>
                                    <span v-else>{{ value.label }}</span>
                                </McBreadcrumbLink>
                                <McBreadcrumbSeparator
                                    v-if="index < crumbs.length - 1"
                                    class="tw:shrink-0"
                                />
                            </McBreadcrumbItem>
                        </template>
                    </McBreadcrumbList>
                </McBreadcrumb>
            </div>

            <!--
                Where a page hangs its own actions in the app bar. Empty and unconditional: a
                Teleport whose target is behind a v-if finds null and throws, and this bar renders
                before any page body does, so a target here is always ready.

                The bar is `justify-between` with only the trigger and breadcrumb in it, so this side
                was doing nothing. A page-level control belongs here rather than floating over the
                page's own content - see /image-detection, which puts its history button in it.
            -->
            <div id="mc-header-actions" class="tw:flex tw:shrink-0 tw:items-center tw:gap-1"></div>
        </div>
        <!--
            svh, not vh, and 3rem rather than a rounded-off 50px.

            `100vh` on a phone is the LARGE viewport - the height the page gets once the browser's
            toolbars have scrolled away - so `100vh - nav` is always taller than what is actually on
            screen, and every page here scrolled a little even when its content fitted. `100svh` is
            the small viewport, the one you can see with the toolbars showing. The 3rem matches the
            bar above it (min-h-12); 50px was two pixels of unexplained overflow on its own.
        -->
        <div class="tw:min-h-[calc(100svh-3rem)] tw:bg-[#f9f9f9]">
            <!-- `data-mc-page-container` is the handle a full-screen page uses to drop the width cap
                 below lg - see `.mc-full-bleed` in main.css. The page's own negative margins can
                 cancel the p-4, but a max-width up here is not something a child can undo. -->
            <div data-mc-page-container class="tw:container tw:mx-auto tw:p-4">
                <slot />
            </div>
        </div>
    </main>
</template>

<style scoped lang="scss">
.logo-text {
    font-size: 1.25rem;
    font-weight: 800;
    letter-spacing: -0.025em;
    background: linear-gradient(90deg, var(--color-primary), var(--color-primary-hover));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
</style>
