<template>
    <McSidebarProvider>
        <McAppSideBar />
        <McSidebarMain>
            <slot />
        </McSidebarMain>
    </McSidebarProvider>
</template>

<style scoped lang="scss">
.content-container {
    margin: 24px;
    background: var(--color-secondary);
    min-height: 280px;
    border-radius: 8px;
    overflow: initial;
}
</style>
