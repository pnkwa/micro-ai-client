import dayjs from 'dayjs'
import buddhistEra from 'dayjs/plugin/buddhistEra'
import 'dayjs/locale/th'
import toArray from 'dayjs/plugin/toArray'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import isToday from 'dayjs/plugin/isToday'
import utc from 'dayjs/plugin/utc'
import arraySupport from 'dayjs/plugin/arraySupport'
import localeData from 'dayjs/plugin/localeData'
import updateLocale from 'dayjs/plugin/updateLocale'
import relativeTime from 'dayjs/plugin/relativeTime'
import isBetween from 'dayjs/plugin/isBetween'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(localeData)
dayjs.extend(arraySupport)
dayjs.extend(isToday)
dayjs.extend(toArray)
dayjs.extend(buddhistEra)
dayjs.extend(customParseFormat)
dayjs.extend(utc)
dayjs.extend(relativeTime)
dayjs.extend(updateLocale)
dayjs.extend(isBetween)
dayjs.extend(timezone)

export default defineNuxtPlugin(() => {
    return {
        provide: {
            dayjs,
        },
    }
})
