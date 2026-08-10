<script setup lang="ts" generic="TData, TValue">
import { valueUpdater } from '../ui/table/utils'
import type {
    Cell,
    ColumnDef,
    ColumnFiltersState,
    ExpandedState,
    Header,
    PaginationState,
    SortingState,
    VisibilityState,
} from '@tanstack/vue-table'
import {
    FlexRender,
    getCoreRowModel,
    getExpandedRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useVueTable,
} from '@tanstack/vue-table'

const props = withDefaults(
    defineProps<{
        columns: ColumnDef<TData, TValue>[]
        data: TData[]
        total?: number
        pagination?: PaginationState
        loading?: boolean
        serverSide?: boolean
        sequentialNumber?: boolean
        stickyLeftColumns?: number
        stickyRightColumns?: number
        /**
         * Hold the table to a fixed height (any CSS length) instead of growing with the rows: the
         * rows scroll inside it under a stuck header, the pagination bar below stays in view, and
         * the footprint is the same whether it holds two rows, two hundred, or none — the loading
         * and empty placeholders fill the same space rather than sitting in a short card above
         * dead space. Unset — the default everywhere else — lets the table grow and the window
         * scroll it.
         */
        bodyHeight?: string
    }>(),
    {
        loading: false,
        serverSide: false,
        sequentialNumber: false,
        stickyLeftColumns: 0,
        stickyRightColumns: 0,
    },
)

const emit = defineEmits(['update:pagination'])
const slots = defineSlots()

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref({})
const expanded = ref<ExpandedState>({})

// Scroll detection for shadows
const scrollContainer = useTemplateRef('scrollContainer')
const showLeftShadow = ref(false)
const showRightShadow = ref(false)

const handleScroll = () => {
    if (!scrollContainer.value) return

    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value.$el

    showLeftShadow.value = scrollLeft > 0

    showRightShadow.value = scrollLeft < scrollWidth - clientWidth - 1
}
useEventListener(
    () => scrollContainer.value?.$el,
    'scroll',
    () => {
        handleScroll()
    },
)

const { pagination } = useVModels(props, emit)

const setPagination = ({ pageIndex, pageSize }: PaginationState): PaginationState => {
    pagination.value = { pageIndex, pageSize }

    return { pageIndex, pageSize }
}

const rowCount = computed(() => {
    return props.total || 0
})

const table = computed(() => {
    return useVueTable({
        ...(props.serverSide && { manualPagination: true }),
        onPaginationChange: (updater) => {
            if (typeof updater === 'function') {
                if (!pagination.value) {
                    return
                }

                setPagination(
                    updater({
                        pageIndex: pagination.value.pageIndex,
                        pageSize: pagination.value.pageSize,
                    }),
                )
            } else {
                setPagination(updater)
            }
        },

        ...(rowCount.value > 0 && {
            get rowCount() {
                return rowCount.value
            },
        }),
        get data() {
            return props.data
        },
        get columns() {
            return props.columns
        },
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        onSortingChange: (updaterOrValue) => valueUpdater(updaterOrValue, sorting),
        onColumnFiltersChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnFilters),
        onColumnVisibilityChange: (updaterOrValue) =>
            valueUpdater(updaterOrValue, columnVisibility),
        onRowSelectionChange: (updaterOrValue) => valueUpdater(updaterOrValue, rowSelection),
        onExpandedChange: (updaterOrValue) => valueUpdater(updaterOrValue, expanded),
        state: {
            get sorting() {
                return sorting.value
            },
            get columnFilters() {
                return columnFilters.value
            },
            get columnVisibility() {
                return columnVisibility.value
            },
            get rowSelection() {
                return rowSelection.value
            },
            get expanded() {
                return expanded.value
            },
            get pagination() {
                return pagination.value
            },
        },
    })
})

const columnClass = (headerIndex: number, header: Header<TData, unknown>) => {
    const classNames = [header.column.columnDef.meta?.headerClass || '']

    const totalSequentialColumns = props.sequentialNumber ? 1 : 0
    const adjustedIndex = headerIndex + totalSequentialColumns

    if (adjustedIndex < props.stickyLeftColumns + totalSequentialColumns) {
        const isLastLeftColumn =
            adjustedIndex === props.stickyLeftColumns + totalSequentialColumns - 1
        const shadow = isLastLeftColumn && showLeftShadow.value
        if (shadow) {
            classNames.push('mc-table__last-left-shadow-column')
        }
    }

    const totalHeaders = table.value.getHeaderGroups()[0]?.headers.length || 0
    const rightColumnStart = totalHeaders - props.stickyRightColumns

    if (headerIndex >= rightColumnStart && props.stickyRightColumns > 0) {
        const isFirstRightColumn = headerIndex === rightColumnStart
        const shadow = isFirstRightColumn && showRightShadow.value
        if (shadow) {
            classNames.push('mc-table__first-right-shadow-column')
        }
    }

    return cn(classNames)
}

const columnStyle = (headerIndex: number, header: Header<TData, unknown>) => {
    const baseStyle = {
        minWidth: `${header.getSize()}px`,
        // Fixed layout sizes every column from the header row, so the width has to be stated there.
        ...(props.bodyHeight && { width: `${header.getSize()}px` }),
        ...(header.column.columnDef.meta?.headerStyle || {}),
    }

    const totalSequentialColumns = props.sequentialNumber ? 1 : 0
    const adjustedIndex = headerIndex + totalSequentialColumns

    if (adjustedIndex < props.stickyLeftColumns + totalSequentialColumns) {
        let leftPosition = 0

        if (props.sequentialNumber && headerIndex >= 0) {
            leftPosition += 60
        }

        const headerGroups = table.value.getHeaderGroups()
        if (headerGroups.length > 0 && headerGroups[0]) {
            for (let i = 0; i < headerIndex; i++) {
                const prevHeader = headerGroups[0].headers[i]
                leftPosition += prevHeader?.getSize() || 0
            }
        }

        const isLastLeftColumn =
            adjustedIndex === props.stickyLeftColumns + totalSequentialColumns - 1
        const shadow =
            isLastLeftColumn && showLeftShadow.value ? '1px solid rgba(0, 0, 0, 0.1)' : 'none'

        return {
            ...baseStyle,
            position: 'sticky',
            left: `${leftPosition}px`,
            zIndex: 10,
            backgroundColor: 'var(--background)',
            '::before': {
                content: '',
                position: 'absolute',
                top: 0,
                right: 0,
                height: '100%',
                width: '4px',
                boxShadow: shadow,
            },
        }
    }

    const totalHeaders = table.value.getHeaderGroups()[0]?.headers.length || 0
    const rightColumnStart = totalHeaders - props.stickyRightColumns

    if (headerIndex >= rightColumnStart && props.stickyRightColumns > 0) {
        let rightPosition = 0

        const headerGroups = table.value.getHeaderGroups()
        if (headerGroups.length > 0 && headerGroups[0]) {
            for (let i = headerIndex + 1; i < totalHeaders; i++) {
                const nextHeader = headerGroups[0].headers[i]
                rightPosition += nextHeader?.getSize() || 0
            }
        }

        const isFirstRightColumn = headerIndex === rightColumnStart
        const shadow =
            isFirstRightColumn && showRightShadow.value ? '-2px 0 4px rgba(0, 0, 0, 0.1)' : 'none'

        return {
            ...baseStyle,
            position: 'sticky',
            right: `${rightPosition}px`,
            zIndex: 10,
            backgroundColor: 'var(--background)',
            boxShadow: shadow,
        }
    }

    return baseStyle
}

const cellStyle = (cellIndex: number, cell: Cell<TData, unknown>) => {
    const baseStyle = {
        ...(cell.column.columnDef.meta?.cellStyle || {}),
    }

    const totalSequentialColumns = props.sequentialNumber ? 1 : 0
    const adjustedIndex = cellIndex + totalSequentialColumns

    if (adjustedIndex < props.stickyLeftColumns + totalSequentialColumns) {
        let leftPosition = 0

        if (props.sequentialNumber && cellIndex >= 0) {
            leftPosition += 60
        }

        const headerGroups = table.value.getHeaderGroups()
        if (headerGroups.length > 0 && headerGroups[0]) {
            for (let i = 0; i < cellIndex; i++) {
                const prevHeader = headerGroups[0].headers[i]
                leftPosition += prevHeader?.getSize() || 0
            }
        }

        const isLastLeftColumn =
            adjustedIndex === props.stickyLeftColumns + totalSequentialColumns - 1
        const shadow =
            isLastLeftColumn && showLeftShadow.value ? '2px 0 4px rgba(0, 0, 0, 0.1)' : 'none'

        return {
            ...baseStyle,
            position: 'sticky',
            left: `${leftPosition}px`,
            zIndex: 9,
            backgroundColor: 'var(--background)',
            boxShadow: shadow,
        }
    }

    const totalCells = table.value.getHeaderGroups()[0]?.headers.length || 0
    const rightColumnStart = totalCells - props.stickyRightColumns

    if (cellIndex >= rightColumnStart && props.stickyRightColumns > 0) {
        let rightPosition = 0

        const headerGroups = table.value.getHeaderGroups()
        if (headerGroups.length > 0 && headerGroups[0]) {
            for (let i = cellIndex + 1; i < totalCells; i++) {
                const nextHeader = headerGroups[0].headers[i]
                rightPosition += nextHeader?.getSize() || 0
            }
        }

        // Check if this is the first right sticky column for shadow
        const isFirstRightColumn = cellIndex === rightColumnStart
        const shadow =
            isFirstRightColumn && showRightShadow.value ? '-2px 0 4px rgba(0, 0, 0, 0.1)' : 'none'

        return {
            ...baseStyle,
            position: 'sticky',
            right: `${rightPosition}px`,
            zIndex: 9,
            backgroundColor: 'var(--background)',
            boxShadow: shadow,
        }
    }

    return baseStyle
}

const cellClass = (cellIndex: number, cell: Cell<TData, unknown>) => {
    const classNames = [fixedCellClass.value, cell.column.columnDef.meta?.cellClass || '']

    const totalSequentialColumns = props.sequentialNumber ? 1 : 0
    const adjustedIndex = cellIndex + totalSequentialColumns

    if (adjustedIndex < props.stickyLeftColumns + totalSequentialColumns) {
        const isLastLeftColumn =
            adjustedIndex === props.stickyLeftColumns + totalSequentialColumns - 1
        const shadow = isLastLeftColumn && showLeftShadow.value

        if (shadow) {
            classNames.push('mc-table__last-left-shadow-column')
        }
    }

    const totalCells = table.value.getHeaderGroups()[0]?.headers.length || 0
    const rightColumnStart = totalCells - props.stickyRightColumns

    if (cellIndex >= rightColumnStart && props.stickyRightColumns > 0) {
        // Check if this is the first right sticky column for shadow
        const isFirstRightColumn = cellIndex === rightColumnStart
        const shadow = isFirstRightColumn && showRightShadow.value
        if (shadow) {
            classNames.push('mc-table__first-right-shadow-column')
        }
    }

    return cn(classNames)
}

// Only meaningful once the height is fixed: the header rides the top of that scroll container
// rather than the window. z-20 keeps it above the body's sticky columns (z-9) but below the
// layout's sticky breadcrumb bar (z-30), which owns the top of the viewport.
const stickyHeaderClass = computed(() =>
    props.bodyHeight ? 'tw:sticky tw:top-0 tw:z-20 tw:bg-background' : '',
)

const hasRows = computed(() => !props.loading && (table.value.getRowModel().rows?.length ?? 0) > 0)

// A fixed-height table takes a fixed layout too, so each column's width comes from its declared
// size rather than from whatever text this particular page happens to hold — otherwise the
// columns jump as you step through pages of longer and shorter names. A cell can no longer
// stretch to fit, so overflow is clipped to an ellipsis instead of spilling into its neighbour.
const fixedLayoutClass = computed(() => (props.bodyHeight ? 'tw:table-fixed' : ''))
const fixedCellClass = computed(() =>
    props.bodyHeight ? 'tw:overflow-hidden tw:text-ellipsis' : '',
)

// Only the table with rows in it takes the leftover space. With none, it keeps its natural
// height — the header row alone — and the placeholder below claims the rest, so the message
// lands in the middle of the card rather than halfway down an empty grid.
const tableRegionStyle = computed(() => {
    if (!props.bodyHeight) return undefined
    // Hold the scrollbar's gutter whether or not this page overflows. A full page scrolls and a
    // short last page doesn't, so without this the table is wider on the last page and every
    // column shifts as you step through the pages.
    const gutter = { scrollbarGutter: 'stable' }
    return hasRows.value ? { ...gutter, flex: '1 1 0%', minHeight: '0' } : gutter
})
const placeholderClass = computed(() => (props.bodyHeight ? 'tw:flex-1' : 'tw:h-55'))

const sequentialNumberColumnStyle = computed(() => {
    if (!props.sequentialNumber) return {}

    const isSticky = props.stickyLeftColumns > 0
    if (!isSticky) return { minWidth: '60px' }

    // Sequential number is always the first column, so it gets shadow when there are more sticky columns
    const hasRightShadow = props.stickyLeftColumns > 1 && showLeftShadow.value
    const shadow = hasRightShadow ? '2px 0 4px rgba(0, 0, 0, 0.1)' : 'none'

    return {
        minWidth: '60px',
        position: 'sticky',
        zIndex: 11,
        left: '0px',
        backgroundColor: 'var(--background)',
        boxShadow: shadow,
    }
})

defineExpose({
    table,
})
</script>

<template>
    <div
        class="tw:rounded-md tw:overflow-hidden"
        :class="bodyHeight && 'tw:flex tw:flex-col'"
        :style="bodyHeight ? { height: bodyHeight } : undefined"
    >
        <!-- style falls through to McTable's scroll container (its only declared prop is
             `class`, which it puts on the inner <table>), so this sizes the same element that
             already owns overflow. -->
        <McTable
            ref="scrollContainer"
            :class="fixedLayoutClass"
            :style="tableRegionStyle"
            @scroll="handleScroll"
        >
            <McTableHeader>
                <McTableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                    <McTableHead
                        v-if="sequentialNumber"
                        :class="cn('tw:text-center', stickyHeaderClass)"
                        :style="sequentialNumberColumnStyle"
                    >
                        No.
                    </McTableHead>
                    <McTableHead
                        v-for="header in headerGroup.headers"
                        :key="header.id"
                        :class="
                            cn(
                                'tw:text-center',
                                stickyHeaderClass,
                                columnClass(header.index, header),
                            )
                        "
                        :style="{
                            ...columnStyle(header.index, header),
                        }"
                    >
                        <template
                            v-if="
                                'accessorKey' in header.column.columnDef &&
                                typeof header.column.columnDef.accessorKey === 'string'
                            "
                        >
                            <FlexRender
                                v-if="
                                    !header.isPlaceholder &&
                                    !slots[`header-${header.column.columnDef.accessorKey}`]
                                "
                                :render="header.column.columnDef.header"
                                :props="header.getContext()"
                            />
                            <component
                                :is="slots[`header-${header.column.columnDef.accessorKey}`]"
                                v-else
                                v-bind="{ header }"
                            />
                        </template>
                        <FlexRender
                            v-else
                            :render="header.column.columnDef.header"
                            :props="header.getContext()"
                        />
                    </McTableHead>
                </McTableRow>
            </McTableHeader>
            <McTableBody>
                <template v-if="!props.loading && table.getRowModel().rows?.length > 0">
                    <McTableRow
                        v-for="row in table.getRowModel().rows"
                        :key="row.id"
                        :data-state="row.getIsSelected() ? 'selected' : undefined"
                    >
                        <McTableCell
                            v-if="sequentialNumber && pagination"
                            class="tw:text-center"
                            :style="sequentialNumberColumnStyle"
                        >
                            {{
                                (pagination.pageIndex + 1) * pagination.pageSize -
                                pagination.pageSize +
                                (row.index + 1)
                            }}
                        </McTableCell>
                        <McTableCell
                            v-for="(cell, cellIndex) in row.getVisibleCells()"
                            :key="cell.id"
                            :class="cn('tw:text-center', cellClass(cellIndex, cell))"
                            :style="{
                                ...cellStyle(cellIndex, cell),
                            }"
                        >
                            <template
                                v-if="
                                    'accessorKey' in cell.column.columnDef &&
                                    typeof cell.column.columnDef.accessorKey === 'string'
                                "
                            >
                                <FlexRender
                                    v-if="!slots[`body-${cell.column.columnDef.accessorKey}`]"
                                    :render="cell.column.columnDef.cell"
                                    :props="cell.getContext()"
                                />
                                <component
                                    :is="slots[`body-${cell.column.columnDef.accessorKey}`]"
                                    v-bind="{ row, cell }"
                                />
                            </template>
                            <FlexRender
                                v-else
                                :render="cell.column.columnDef.cell"
                                :props="cell.getContext()"
                            />
                        </McTableCell>
                    </McTableRow>
                </template>
            </McTableBody>
        </McTable>
        <template v-if="props.loading">
            <div
                :class="cn('tw:w-full tw:flex tw:items-center tw:justify-center', placeholderClass)"
            >
                <McLoading :width="125" :height="125" />
            </div>
        </template>
        <template v-else-if="table.getRowModel().rows?.length === 0">
            <div
                :class="cn('tw:w-full tw:flex tw:items-center tw:justify-center', placeholderClass)"
            >
                <span>No results.</span>
            </div>
        </template>
    </div>
    <McDataTablePagination v-if="props.pagination" :table="table" :total="props.total" />
</template>

<style lang="scss" scoped>
.mc-table__first-right-shadow-column {
    &::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        width: 4px;
        box-shadow: -2px 0 4px rgba(0, 0, 0, 0.1);
    }
}

.mc-table__last-left-shadow-column {
    &::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        height: 100%;
        width: 4px;
        box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
    }
}
</style>
