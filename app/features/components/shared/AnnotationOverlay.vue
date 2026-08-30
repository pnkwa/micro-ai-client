<script setup lang="ts">
import type { Shape } from '~/core/helpers/annotationShapes'
import type { AnnotationLabel } from '~/services/annotationLabelService'
import { colorForShape } from '~/core/helpers/annotationClasses'

/**
 * Annotations painted on a picture. THE ONLY RENDERER, used by the annotator and the library.
 *
 * It emits the SVG children and not the `<svg>`, so each caller keeps its own viewBox and its own
 * coordinate system: the annotator's lives inside a transformed wrapper so shapes inherit the
 * picture's pan and zoom, and the library's preview is a plain fitted box. Wrapping the element
 * here would force one of those to fight the other.
 *
 * *** COORDINATES ARE NORMALISED 0..1 AND SCALED BY `natural`. *** That is what lets the same
 * shapes render at 208px in a card, 400px in the inspector and 4000px at full zoom without anything
 * being recomputed.
 *
 * The callbacks exist for the annotator, which paints the same geometry with interaction state on
 * top: a selected shape is thicker, a delete target is red, and an unnamed one takes a casing. The
 * library passes none of them and gets the plain class colours.
 */
const props = withDefaults(
    defineProps<{
        shapes: Shape[]
        /** The picture's pixel size, which the normalised coordinates are multiplied by. */
        natural: { w: number; h: number }
        /** Class colours. Ignored when `strokeFor` is supplied. */
        palette?: AnnotationLabel[]
        /** Overrides the class colour, for the states that mean something more urgent. */
        strokeFor?: (shape: Shape) => string
        widthFor?: (shape: Shape) => number
        /** Which shapes take a halo, and what it is drawn in. */
        cased?: (shape: Shape) => boolean
        casing?: string
        casingWidthFor?: (shape: Shape) => number
        fillOpacity?: number | string
    }>(),
    { fillOpacity: 0.18 },
)

/** White for a shape with no class: it belongs to none, so it cannot be mistaken for one. */
const NEUTRAL = '#ffffff'

const strokeOf = (shape: Shape): string =>
    props.strokeFor?.(shape) ?? colorForShape(props.palette ?? [], shape) ?? NEUTRAL

const widthOf = (shape: Shape): number => props.widthFor?.(shape) ?? 2

const points = (shape: Shape): string =>
    (shape.polygon ?? [])
        .map((point) => `${point.x * props.natural.w},${point.y * props.natural.h}`)
        .join(' ')

const rect = (shape: Shape) => ({
    x: shape.x * props.natural.w,
    y: shape.y * props.natural.h,
    width: shape.w * props.natural.w,
    height: shape.h * props.natural.h,
})
</script>

<template>
    <g v-for="shape in shapes" :key="shape.id">
        <!--
            THE CASING: a wider stroke drawn UNDER the shape's own.

            These fields are roughly half bright and half dark, measured across the batch, so no
            single outline colour reads everywhere. A halo separates the line from whichever it
            landed on without changing the colour that says which class this is.
        -->
        <template v-if="cased?.(shape) && casing">
            <polygon
                v-if="shape.polygon"
                :points="points(shape)"
                fill="none"
                :stroke="casing"
                :stroke-width="casingWidthFor?.(shape) ?? widthOf(shape) + 3"
                stroke-linejoin="round"
            />
            <rect
                v-else
                v-bind="rect(shape)"
                fill="none"
                :stroke="casing"
                :stroke-width="casingWidthFor?.(shape) ?? widthOf(shape) + 3"
            />
        </template>

        <polygon
            v-if="shape.polygon"
            :points="points(shape)"
            :fill="strokeOf(shape)"
            :fill-opacity="fillOpacity"
            :stroke="strokeOf(shape)"
            :stroke-width="widthOf(shape)"
            stroke-linejoin="round"
        />
        <rect
            v-else
            v-bind="rect(shape)"
            :fill="strokeOf(shape)"
            :fill-opacity="fillOpacity"
            :stroke="strokeOf(shape)"
            :stroke-width="widthOf(shape)"
        />
    </g>
</template>
