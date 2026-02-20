import {
  atom,
  selector,
  useSetRecoilState,
  useRecoilValue,
  useRecoilCallback,
} from 'recoil';

import { getCurrentPeriod } from './utlis';
import { LogProps, RangeType, TimePeriod, NutrientStatsProps} from './structures';
import { request } from './endpoints';
import { tolocalDateString } from './utlis';
import { nutrientDetailsByIDAtom } from './account_states';

// Deep comparison using JSON serialization
// Works well for log/requirement data (dozens of items, not thousands)
function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

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
  const refreshData = useRecoilCallback(({snapshot, set}) => async () => {
    // Get current values without triggering re-render
    const dateRange = await snapshot.getPromise(dateRangeAtom);
    const currentLogs = await snapshot.getPromise(logsAtom);
    const currentRequirements = await snapshot.getPromise(requirementsAtom);

    const [logData, requirementsData] = await Promise.all([
      request('/logs/get?startDate='
        + tolocalDateString(dateRange.start)
        + '&endDate='
        + tolocalDateString(dateRange.end) + ''),
      request('/requirements/all')
    ]);

    // Only update if data has actually changed
    if (!deepEqual(currentLogs, logData.body)) {
      set(logsAtom, logData.body);
    }

    if (!deepEqual(currentRequirements, requirementsData.body)) {
      set(requirementsAtom, requirementsData.body);
    }
  }, []);

  return refreshData;
}

function useRefreshLogs() {
  const refreshLogs = useRecoilCallback(({snapshot, set}) => async () => {
    // Get current values without triggering re-render
    const dateRange = await snapshot.getPromise(dateRangeAtom);
    const currentLogs = await snapshot.getPromise(logsAtom);

    const data = await request('/logs/get?startDate='
      + tolocalDateString(dateRange.start)
      + '&endDate='
      + tolocalDateString(dateRange.end) + '');

    // Only update if data has actually changed
    if (!deepEqual(currentLogs, data.body)) {
      set(logsAtom, data.body);
    }
  }, []);

  return refreshLogs;
}

function useRefreshRequirements() {
  const refreshRequirements = useRecoilCallback(({snapshot, set}) => async () => {
    // Get current values without triggering re-render
    const currentRequirements = await snapshot.getPromise(requirementsAtom);

    const data = await request('/requirements/all');

    // Only update if data has actually changed
    if (!deepEqual(currentRequirements, data.body)) {
      set(requirementsAtom, data.body);
    }
  }, []);

  return refreshRequirements;
}

const rangeTypeAtom = atom<RangeType>({
  key: 'rangetype',
  default: RangeType.default
})

const requirementsAtom = atom<{[key: string]: any}>({
  key: 'requirements',
  default: {}
})

// Cached panel data to prevent duplicate API calls
let panelCache: { logId: string | null; data: {[key: string]: number} | null } = { logId: null, data: null };

const dayIntake = selector<{[key: string]: number}>({
  key: 'dayIntake',
  get: async ({get}) => {
    const day = get(currentDayAtom)
    const logs = get(logsAtom)
    // Add requirements as dependency so intake recalculates when requirements change
    const requirements = get(requirementsAtom)
    let endpoint = '/logs/day_intake?date=' + tolocalDateString(day)
    let response = await request(endpoint)
    return response.body;
  }
})

// Separate selector for hovered log panel data with caching
const hoveredLogPanelData = selector<{[key: string]: number} | null>({
  key: 'hoveredLogPanelData',
  get: async ({get}) => {
    const log = get(hoveredLogAtom)

    if (!log) {
      panelCache = { logId: null, data: null };
      return null;
    }

    const logId = log[0];

    // Return cached data if same log
    if (panelCache.logId === logId && panelCache.data !== null) {
      return panelCache.data;
    }

    // Fetch new data
    const response = await request('/food/panel?log_id=' + logId);
    panelCache = { logId, data: response.body };
    return response.body;
  }
})

const averageIntake = selector<{[key : string] : number}>({
  key: 'avgIntake',
  get: async ({get}) => {
    const dateRange = get(dateRangeAtom)
    // included so that addding new logs automatically refreshes
    const logs = get(logsAtom)
    // Add requirements as dependency so intake recalculates when requirements change
    const requirements = get(requirementsAtom)
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
    const hoveredLog = get(hoveredLogAtom);
    const hoveredPanelData = get(hoveredLogPanelData);
    const dayIntakeData = get(dayIntake);
    const avgValues = get(averageIntake);

    // Use hovered panel data if a log is hovered, otherwise use day intake
    const dailyValues = hoveredLog && hoveredPanelData ? hoveredPanelData : dayIntakeData;

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
  hoveredLogPanelData,
  pendingFoodsAtom,
  hoveredLogAtom
}