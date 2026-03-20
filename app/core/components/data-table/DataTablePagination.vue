<script setup lang="ts" generic="TData">
import type { Table } from '@tanstack/vue-table'

interface DataTablePaginationProps {
    table: Table<TData>
    total?: number
}
const props = defineProps<DataTablePaginationProps>()

const handleChangePagination = (page: number) => {
    props.table.setPageIndex(page - 1)
}
</script>

<template>
    <div class="tw:flex tw:items-center tw:pt-2 tw:justify-between tw:pb-2 tw:px-2">
        <div class="tw:flex-1 tw:text-base tw:text-muted-foreground">
            <!-- {{ table.getFilteredSelectedRowModel().rows.length }} of
            {{ table.getFilteredRowModel().rows.length }} row(s) selected. -->
        </div>
        <div class="tw:flex tw:items-center tw:space-x-6 lg:tw:space-x-8">
            <div class="tw:flex tw:items-center tw:space-x-4">
                <p class="tw:font-medium tw:text-base tw:text-nowrap">Rows per page</p>
                <McSelect
                    class="tw:w-[80px]"
                    :model-value="table.getState().pagination.pageSize"
                    width="70"
                    :options="[
                        { label: '10', value: 10 },
                        { label: '20', value: 20 },
                        { label: '30', value: 30 },
                        { label: '40', value: 40 },
                        { label: '50', value: 50 },
                    ]"
                    @update:model-value="table.setPageSize as any"
                />
            </div>
            <div class="tw:flex tw:w-25 tw:items-center tw:text-base tw:justify-center">
                Page {{ table.getState().pagination.pageIndex + 1 }} of
                {{ Math.max(table.getPageCount(), 1) }}
            </div>
            <div class="tw:flex tw:items-center tw:space-x-2">
                <McPagination
                    v-slot="{ page }"
                    :sibling-count="1"
                    show-edges
                    :page="table.getState().pagination.pageIndex + 1"
                    :items-per-page="table.getState().pagination.pageSize"
                    :total="table.getRowCount()"
                    @update:page="
                        (page) => {
                            handleChangePagination(page)
                        }
                    "
                >
                    <McPaginationContent v-slot="{ items }">
                        <McPaginationPrevious />

                        <template v-for="(item, index) in items" :key="index">
                            <McPaginationItem
                                v-if="item.type === 'page'"
                                :value="item.value"
                                :is-active="item.value === page"
                            >
                                {{ item.value }}
                            </McPaginationItem>
                            <McPaginationEllipsis v-else :key="item.type" :index="index" />
                        </template>

                        <McPaginationNext />
                    </McPaginationContent>
                </McPagination>
            </div>
        </div>
    </div>
</template>
