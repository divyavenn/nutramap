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

function toNum(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  }
  return Number.NEGATIVE_INFINITY;
}

function areRequirementsEqual(a: {[key: string]: any}, b: {[key: string]: any}): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a || {});
  const bKeys = Object.keys(b || {});
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    const left = a[key];
    const right = b[key];
    if (!right) return false;
    if (toNum(left?.target) !== toNum(right?.target)) return false;
    if (Boolean(left?.should_exceed) !== Boolean(right?.should_exceed)) return false;
  }
  return true;
}

function areComponentsEqual(leftComponents: any[], rightComponents: any[]): boolean {
  if (leftComponents === rightComponents) return true;
  if (leftComponents.length !== rightComponents.length) return false;
  for (let i = 0; i < leftComponents.length; i++) {
    const left = leftComponents[i];
    const right = rightComponents[i];
    if (!right) return false;
    if (String(left?.food_id ?? '') !== String(right?.food_id ?? '')) return false;
    if (String(left?.food_name ?? '') !== String(right?.food_name ?? '')) return false;
    if (String(left?.amount ?? '') !== String(right?.amount ?? '')) return false;
    if (toNum(left?.weight_in_grams) !== toNum(right?.weight_in_grams)) return false;
  }
  return true;
}

function areLogsEqual(leftLogs: LogProps[], rightLogs: LogProps[]): boolean {
  if (leftLogs === rightLogs) return true;
  if (!Array.isArray(leftLogs) || !Array.isArray(rightLogs)) return false;
  if (leftLogs.length !== rightLogs.length) return false;

  for (let i = 0; i < leftLogs.length; i++) {
    const left = leftLogs[i];
    const right = rightLogs[i];
    if (!right) return false;
    if (String(left?._id ?? '') !== String(right?._id ?? '')) return false;
    if (toTime(left?.date) !== toTime(right?.date)) return false;
    if (String(left?.meal_name ?? '') !== String(right?.meal_name ?? '')) return false;
    if (String(left?.recipe_id ?? '') !== String(right?.recipe_id ?? '')) return false;
    if (toNum(left?.servings) !== toNum(right?.servings)) return false;
    if (toNum(left?.logged_weight_grams) !== toNum(right?.logged_weight_grams)) return false;
    if (!areComponentsEqual(left?.components ?? [], right?.components ?? [])) return false;
  }
  return true;
}

const LOGS_PAGE_LIMIT = 500;
const LOGS_CACHE_TTL_MS = 45_000;
let refreshDataInFlight: Promise<void> | null = null;
const refreshLogsInFlightByRange = new Map<string, Promise<void>>();
let refreshRequirementsInFlight: Promise<void> | null = null;
const logsRangeCache = new Map<string, { data: LogProps[]; cachedAt: number }>();

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

const logsLoadingAtom = atom<boolean>({
  key: 'logsLoading',
  default: false,
})

const requirementsLoadingAtom = atom<boolean>({
  key: 'requirementsLoading',
  default: false,
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
    if (refreshDataInFlight) return refreshDataInFlight;

    refreshDataInFlight = (async () => {
      set(logsLoadingAtom, true);
      set(requirementsLoadingAtom, true);
      // Get current values without triggering re-render
      const dateRange = await snapshot.getPromise(dateRangeAtom);
      const currentLogs = await snapshot.getPromise(logsAtom);
      const currentRequirements = await snapshot.getPromise(requirementsAtom);

      try {
        const [logData, requirementsData] = await Promise.all([
          request('/logs/get?startDate='
            + tolocalDateString(dateRange.start)
            + '&endDate='
            + tolocalDateString(dateRange.end)
            + '&limit='
            + LOGS_PAGE_LIMIT
            + '&offset=0'),
          request('/requirements/all')
        ]);

        const nextLogs = (logData.status === 200 && Array.isArray(logData.body)) ? logData.body : [];
        const nextRequirements = (
          requirementsData.status === 200 &&
          requirementsData.body &&
          typeof requirementsData.body === 'object' &&
          !Array.isArray(requirementsData.body)
        ) ? requirementsData.body : {};

        // Only update if data has actually changed
        if (!areLogsEqual(currentLogs, nextLogs)) {
          set(logsAtom, nextLogs);
        }

        if (!areRequirementsEqual(currentRequirements, nextRequirements)) {
          set(requirementsAtom, nextRequirements);
        }
      } catch (error) {
        console.error('Failed to refresh dashboard data:', error);
        if (!areLogsEqual(currentLogs, [])) {
          set(logsAtom, []);
        }
        if (!areRequirementsEqual(currentRequirements, {})) {
          set(requirementsAtom, {});
        }
      } finally {
        set(logsLoadingAtom, false);
        set(requirementsLoadingAtom, false);
      }
    })().finally(() => {
      refreshDataInFlight = null;
    });

    return refreshDataInFlight;
  }, []);

  return refreshData;
}

function useRefreshLogs() {
  const refreshLogs = useRecoilCallback(({snapshot, set}) => async () => {
    const dateRange = await snapshot.getPromise(dateRangeAtom);
    const currentLogs = await snapshot.getPromise(logsAtom);
    const startDate = tolocalDateString(dateRange.start);
    const endDate = tolocalDateString(dateRange.end);
    const rangeKey = `${startDate}|${endDate}|${LOGS_PAGE_LIMIT}|0`;

    const cached = logsRangeCache.get(rangeKey);
    const hasFreshCache =
      !!cached && (Date.now() - cached.cachedAt) <= LOGS_CACHE_TTL_MS;

    if (cached && !areLogsEqual(currentLogs, cached.data)) {
      // Show cached range data immediately for snappy month/day switches.
      set(logsAtom, cached.data);
    }
    if (hasFreshCache) {
      return;
    }

    const inFlight = refreshLogsInFlightByRange.get(rangeKey);
    if (inFlight) return inFlight;

    if (!cached) {
      set(logsLoadingAtom, true);
    }

    const refreshPromise = (async () => {
      try {
        const data = await request('/logs/get?startDate='
          + startDate
          + '&endDate='
          + endDate
          + '&limit='
          + LOGS_PAGE_LIMIT
          + '&offset=0');

        const nextLogs = (data.status === 200 && Array.isArray(data.body)) ? data.body : [];
        logsRangeCache.set(rangeKey, { data: nextLogs, cachedAt: Date.now() });
        if (!areLogsEqual(currentLogs, nextLogs)) {
          set(logsAtom, nextLogs);
        }
      } catch (error) {
        console.error('Failed to refresh logs:', error);
        if (!areLogsEqual(currentLogs, [])) {
          set(logsAtom, []);
        }
      } finally {
        if (!cached) {
          set(logsLoadingAtom, false);
        }
      }
    })().finally(() => {
      refreshLogsInFlightByRange.delete(rangeKey);
    });

    refreshLogsInFlightByRange.set(rangeKey, refreshPromise);
    return refreshPromise;
  }, []);

  return refreshLogs;
}

function useRefreshRequirements() {
  const refreshRequirements = useRecoilCallback(({snapshot, set}) => async () => {
    if (refreshRequirementsInFlight) return refreshRequirementsInFlight;

    refreshRequirementsInFlight = (async () => {
      set(requirementsLoadingAtom, true);
      // Get current values without triggering re-render
      const currentRequirements = await snapshot.getPromise(requirementsAtom);

      try {
        const data = await request('/requirements/all');
        const nextRequirements = (
          data.status === 200 &&
          data.body &&
          typeof data.body === 'object' &&
          !Array.isArray(data.body)
        ) ? data.body : {};

        // Only update if data has actually changed
        if (!areRequirementsEqual(currentRequirements, nextRequirements)) {
          set(requirementsAtom, nextRequirements);
        }
      } catch (error) {
        console.error('Failed to refresh requirements:', error);
        if (!areRequirementsEqual(currentRequirements, {})) {
          set(requirementsAtom, {});
        }
      } finally {
        set(requirementsLoadingAtom, false);
      }
    })().finally(() => {
      refreshRequirementsInFlight = null;
    });

    return refreshRequirementsInFlight;
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
    try {
      let response = await request(endpoint)
      if (response.status !== 200 || !response.body || typeof response.body !== 'object' || Array.isArray(response.body)) {
        return {};
      }
      return response.body;
    } catch (error) {
      console.error('Failed to fetch day intake:', error);
      return {};
    }
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
    try {
      const response = await request('/food/panel?log_id=' + logId);
      if (response.status !== 200 || !response.body || typeof response.body !== 'object' || Array.isArray(response.body)) {
        panelCache = { logId: null, data: null };
        return null;
      }
      panelCache = { logId, data: response.body };
      return response.body;
    } catch (error) {
      console.error('Failed to fetch hovered panel data:', error);
      panelCache = { logId: null, data: null };
      return null;
    }
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
    try {
      let response = await request(endpoint)
      if (response.status !== 200 || !response.body || typeof response.body !== 'object' || Array.isArray(response.body)) {
        return {};
      }
      return response.body;
    } catch (error) {
      console.error('Failed to fetch average intake:', error);
      return {};
    }
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
  hoveredLogAtom,
  logsLoadingAtom,
  requirementsLoadingAtom,
}
