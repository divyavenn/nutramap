import {
  atom,
  selector,
  useSetRecoilState,
  useRecoilValue,
} from 'recoil';

import { getCurrentPeriod } from './utlis';
import { LogProps, RangeType, TimePeriod, NutrientStatsProps} from './structures';
import { requestWithToken } from './endpoints';
import { tolocalDateString } from './utlis';


function create_atom({key, val} : {key : string, val : any}) {
}

const dateRangeAtom= atom<TimePeriod>({
  key: 'currentPeriod', 
  default : getCurrentPeriod()
})

const currentDayAtom= atom<Date>({
  key: 'currentDay', 
  default : new Date()
})

const logsAtom = atom<LogProps[]>({
  key: 'logs', 
  default : []
})


function useRefreshLogs() {
  let dateRange = useRecoilValue(dateRangeAtom)
  let setLogs = useSetRecoilState(logsAtom)

  const refreshLogs = async () => {
    console.log("refreshing logs")
    let data = await requestWithToken('/logs/get?startDate=' 
    + tolocalDateString(dateRange.start)
    + '&endDate=' 
    + tolocalDateString(dateRange.end) + '');

    setLogs(data)
  }
  return refreshLogs
}

function useRefreshRequirements() {
  let setRequirements = useSetRecoilState(requirementsAtom)
  const refreshRequirements = async () => {
    console.log("refreshing requirements")
    let data = await requestWithToken('/requirements/all')
    setRequirements(data)
  }
  return refreshRequirements
}

const rangeTypeAtom = atom<RangeType>({
  key: 'rangetype',
  default: RangeType.default
})

const requirementsAtom = atom<{[key: string]: any}>({
  key: 'requirements',
  default: []
})

const dayIntake = selector<{[key: string]: number}>({
  key: 'dayIntake',
  get: async ({get}) => {
    const day = get(currentDayAtom)
    const logs = get(logsAtom)
    let endpoint = '/logs/day_intake?date=' 
    + tolocalDateString(day)
    return requestWithToken(endpoint);
  }
})

const averageIntake = selector<{[key : string] : number}>({
  key: 'avgIntake',
  get: async ({get}) => {
    const dateRange = get(dateRangeAtom)
    // included so that addding new logs automatically refreshes 
    const logs = get(logsAtom)
    let endpoint = '/logs/range_intake?startDate=' 
                + tolocalDateString(dateRange.start)
                + '&endDate=' 
                + tolocalDateString(dateRange.end) + ''
    return requestWithToken(endpoint);
  }
})

const rowData = selector<Array<NutrientStatsProps>>({
  key: 'rowData',
  get: ({get}) => {
    console.log("rowdata refreshing")
    const requirements = get(requirementsAtom)
    const dailyValues = get(dayIntake)
    const avgValues = get(averageIntake)

    if (Object.keys(requirements).length > 0) {
      const combined = Object.keys(requirements).map((nutrientId) => {
        const info = requirements[nutrientId]
        const day = dailyValues[nutrientId];
        const average = avgValues[nutrientId];
        return {
          name: info.name,
          target: info.target,
          dayIntake: day,
          avgIntake: average,
          shouldExceed: info.should_exceed,
          units: info.units,
        };
      })
      return combined;
    }
    return []
  }
})


export {dateRangeAtom, currentDayAtom, useRefreshLogs, useRefreshRequirements, logsAtom, rangeTypeAtom, requirementsAtom, rowData, averageIntake, dayIntake}