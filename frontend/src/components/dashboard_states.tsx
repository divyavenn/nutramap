import {
  atom,
  selector,
  useSetRecoilState,
  useRecoilValue,
} from 'recoil';

import { getCurrentPeriod } from './utlis';
import { LogProps, RangeType, TimePeriod, NutrientStatsProps} from './structures';
import { request } from './endpoints';
import { tolocalDateString } from './utlis';
import { nutrientDetailsByIDAtom } from './account_states';

// Define a type for pending foods with timestamps
export interface PendingFood {
  name: string;
  timestamp: string;
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

// Atom to store pending foods that are being processed
const pendingFoodsAtom = atom<PendingFood[]>({
  key: 'pendingFoods',
  default: []
})

// stores id of log [0] and blurb about it [1]
const hoveredLogAtom = atom<string[] | null>({
  key: 'hoveredLog',
  default: null
})

function useRefreshData(){
  let dateRange = useRecoilValue(dateRangeAtom)
  let setLogs = useSetRecoilState(logsAtom)
  let setRequirements = useSetRecoilState(requirementsAtom)

  const refreshData = async () => {
    const [logData, requirementsData] = await Promise.all([
      request('/logs/get?startDate=' 
        + tolocalDateString(dateRange.start)
        + '&endDate=' 
        + tolocalDateString(dateRange.end) + ''),
      request('/requirements/all')
    ]);
    setLogs(logData.body)
    setRequirements(requirementsData.body);
  }
  return refreshData
}

function useRefreshLogs() {
  let dateRange = useRecoilValue(dateRangeAtom)
  let setLogs = useSetRecoilState(logsAtom)

  const refreshLogs = async () => {
    // console.log("refreshing logs")
    let data = await request('/logs/get?startDate=' 
    + tolocalDateString(dateRange.start)
    + '&endDate=' 
    + tolocalDateString(dateRange.end) + '');
    // console.log('logs' + data.body)
    setLogs(data.body)
  }
  return refreshLogs
}

function useRefreshRequirements() {
  let setRequirements = useSetRecoilState(requirementsAtom)
  const refreshRequirements = async () => {
    // console.log("refreshing requirements")
    let data = await request('/requirements/all')
    // console.log(data)
    setRequirements(await data.body)
  }
  return refreshRequirements
}

const rangeTypeAtom = atom<RangeType>({
  key: 'rangetype',
  default: RangeType.default
})

const requirementsAtom = atom<{[key: string]: any}>({
  key: 'requirements',
  default: {}
})

const dayIntake = selector<{[key: string]: number}>({
  key: 'dayIntake',
  get: async ({get}) => {
    const day = get(currentDayAtom)
    const logs = get(logsAtom)
    const log = get(hoveredLogAtom)
    let endpoint = '/logs/day_intake?date=' 
    + tolocalDateString(day)
    if (log) {
      endpoint = '/food/panel?log_id=' + log[0]
    }
    let response = await request(endpoint)
    return response.body;
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
    let response = await request(endpoint)
    return response.body;
  }
})


type RequirementData = {
  id: string;
  name: string;
  target: number;
  shouldExceed: boolean;
  units: string;
};

const requirementsDataAtom = selector<RequirementData[]>({
  key: 'requirementsData',
  get: ({ get }) => {
    const requirements = get(requirementsAtom);
    const nutrientDetails = get(nutrientDetailsByIDAtom);

    if (!requirements || Object.keys(requirements).length === 0) {
      console.warn("No requirements found");
      return [];
    }
    if (!nutrientDetails) {
      console.warn("Nutrient details missing");
      return [];
    }

    return Object.keys(requirements).map((nutrientId) => {
      const requirement = requirements[nutrientId];
      const details = nutrientDetails[parseInt(nutrientId)];

      if (!details) {
        console.warn(`Missing details for nutrient ID: ${nutrientId}`);
        return null;
      }

      return {
        id: nutrientId,
        name: details.name,
        target: requirement.target,
        shouldExceed: requirement.should_exceed,
        units: details.unit,
      };
    }).filter((entry) => entry !== null);
  },
});


const rowData = selector<Array<NutrientStatsProps>>({
  key: 'rowData',
  get: ({get}) => {

    const requirements = get(requirementsAtom);
    const dailyValues = get(dayIntake);
    const avgValues = get(averageIntake);

    const nutrientDetails = get(nutrientDetailsByIDAtom);

    if (!requirements || Object.keys(requirements).length === 0) {
      console.warn("No requirements found");
      return [];
    }
    if (!nutrientDetails) {
      console.warn("Nutrient details missing");
      return [];
    }

    if (Object.keys(requirements).length > 0) {
      const combined = Object.keys(requirements).map((nutrientId) => {
        const requirement = requirements[nutrientId];
        const day = dailyValues[nutrientId];
        const average = avgValues[nutrientId];

        const details = nutrientDetails[parseInt(nutrientId)];
        // Assuming keys in `nutrientDetails` are strings

        if (!details) {
          console.warn(`Missing details for nutrient ID: ${nutrientId}`);
          return null; // Or skip this nutrient if required
        }

        return {
          name: details.name, // Correctly use `name`
          target: requirement.target,
          dayIntake: day,
          avgIntake: average,
          shouldExceed: requirement.should_exceed,
          units: details.unit,
        };
      }).filter((entry) => entry !== null); // Filter out any null entries
      return combined;
    }

    console.warn("No requirements found");
    return [];
  },
});

export {dateRangeAtom, 
  currentDayAtom, 
  useRefreshLogs, 
  useRefreshData, 
  useRefreshRequirements, 
  logsAtom,
  rangeTypeAtom,
  RequirementData,
  requirementsDataAtom,
  requirementsAtom,
  rowData,
  averageIntake,
  dayIntake,
  pendingFoodsAtom,
  hoveredLogAtom
}