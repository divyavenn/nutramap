import {
  atom,
  selector,
  useResetRecoilState,
  useRecoilState,
  useSetRecoilState,
} from 'recoil';
import { useCallback } from 'react';
import { requirementsAtom } from './dashboard_states';
import { request } from './endpoints';

interface AccountInfo{
  name : string,
  email: string;
  password : string;
  isTrial?: boolean;  // Optional flag to indicate trial user
}

const storageObjectCache: Record<string, { raw: string; parsed: Record<string, any> }> = {};
const NUTRIENTS_CACHE_VERSION_KEY = 'nutrients_cache_version';
const NUTRIENTS_CACHE_VERSION = '2';

type NutrientNameMap = Record<string, { id: number; unit: string }>;

const normalizeNutrientNameMap = (input: Record<string, any>): NutrientNameMap => {
  const normalized: NutrientNameMap = {};
  let legacyEnergyEntry: { id: number; unit: string } | null = null;

  for (const [name, details] of Object.entries(input)) {
    if (!details || typeof details !== 'object') continue;
    const id = Number((details as any).id);
    const unit = String((details as any).unit ?? "");
    if (!Number.isFinite(id) || !unit) continue;

    const entry = { id, unit };
    if (name === "Energy" || id === 1008) {
      legacyEnergyEntry = entry;
      continue;
    }
    normalized[name] = entry;
  }

  if (legacyEnergyEntry) {
    normalized["Calories"] = legacyEnergyEntry;
  }

  return normalized;
};


const editingPasswordAtom = atom<boolean>({
  key: 'editingPassword',
  default: false
})

const accountInfoAtom = atom<AccountInfo>({
  key: 'accountInfo',
  default: {
    name : "",
    email : "",
    password : "",
    isTrial: false
  },
  effects: [
    ({setSelf, onSet}) => {
      // Load from localStorage on initialization
      const savedValue = localStorage.getItem('accountInfo');
      if (savedValue != null) {
        try {
          const parsed = JSON.parse(savedValue);
          // Don't persist the password for security
          setSelf({...parsed, password: ""});
        } catch (e) {
          console.error('Error parsing stored account info:', e);
        }
      }

      // Save to localStorage whenever the atom changes
      onSet((newValue, _, isReset) => {
        if (isReset) {
          localStorage.removeItem('accountInfo');
        } else {
          // Don't persist the password for security
          const toStore = {...newValue, password: ""};
          localStorage.setItem('accountInfo', JSON.stringify(toStore));
        }
      });
    }
  ]
})



// you can only use hooks inside other hooks or inside components
function useRefreshAccountInfo() {
  const setAccountInfo = useSetRecoilState(accountInfoAtom);
  const fetchAutoFillData = useFetchAutoFillData();

  const refreshAccountInfo = useCallback(async () => {
    fetchAutoFillData();
    const response = await request('/user/info', 'GET');
    if (response.status === 200 && response.body && typeof response.body === 'object' && !Array.isArray(response.body)) {
      setAccountInfo((prev) => ({
        ...prev,
        ...response.body,
        // Never persist a password from API payload.
        password: "",
      }));
    }
  }, [fetchAutoFillData, setAccountInfo]);

  return refreshAccountInfo;
}

const firstNameAtom = selector<string>({
  key: 'firstName',
  get: ({get}) => {
    let name = get(accountInfoAtom).name
    let firstName = name ? name.trim().split(' ')[0] : "";
    return firstName
  }
})



const useResetAccountAtoms = () => { 
  const resetAccountInfo = useResetRecoilState(accountInfoAtom);
  const resetEditingPassword = useResetRecoilState(editingPasswordAtom);

  const resetAtoms = () => {
    resetAccountInfo();
    resetEditingPassword();
  }

  return resetAtoms;
};



const nutrientDetailsByNameAtom = atom<{[key : string] : {id : number, unit : string}}>({
  key: 'nutrientDetailsbyName',
  default: {}
});

export const availableNutrientsSelector = selector({
  key: 'availableNutrients', // Unique key for this selector
  get: ({ get }) => {
    const requirements = get(requirementsAtom); // Get all existing requirements
    const nutrientDetails = get(nutrientDetailsByIDAtom); // Get all nutrients with their details

    if (!nutrientDetails || Object.keys(nutrientDetails).length === 0) {
      console.warn("Nutrient details are missing or empty.");
      return [];
    }

    const requirementIds = Object.keys(requirements); // Extract IDs of nutrients already in requirements

    // Filter nutrients not in the requirements list
    const availableNutrients = Object.entries(nutrientDetails)
      .filter(([id]) => !requirementIds.includes(id)) // Exclude nutrients in requirements
      .map(([id, details]) => ({
        id,
        name: details.name,
        unit: details.unit,
      }));

    return availableNutrients;
  },
});

const foodsAtom = atom<{[key : string] : number | string}>({
  key: 'foodDetails',
  default: {}
});

// Global state for tracking in-progress custom food creation.
// Array so multiple foods can be created concurrently.
// Persists across navigation so indicators survive route changes.
export interface PendingCustomFood {
  name: string;
  timestamp: string;
}

export const pendingCustomFoodsAtom = atom<PendingCustomFood[]>({
  key: 'pendingCustomFoods',
  default: []
});

const nutrientDetailsByIDAtom = selector<{[key : number] : { name: string, unit: string}}>({
  key: 'nutrientDetailsbyID',
  get: async ({get}) => {
    const data = get(nutrientDetailsByNameAtom)
    const idKeyedMap: Record<number, { name: string; unit: string }> = {};
    for (const [name, details] of Object.entries(data)) {
      idKeyedMap[details.id] = { name, unit: details.unit };
    }
    return idKeyedMap
  }
});

function useFetchAutoFillData(){ 
  const setNutrients = useSetRecoilState(nutrientDetailsByNameAtom);
  const setFoods = useSetRecoilState(foodsAtom);

  const safeParseStorageObject = (key: string): Record<string, any> => {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const cached = storageObjectCache[key];
    if (cached && cached.raw === raw) {
      return cached.parsed;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        storageObjectCache[key] = { raw, parsed };
        return parsed;
      }
    } catch (error) {
      console.warn(`Invalid JSON in localStorage for '${key}', ignoring cached value.`);
    }
    return {};
  };

  const parseCustomFoodsCache = (raw: string | null): Record<string, string> => {
    if (!raw) return {};
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return {};
      const map: Record<string, string> = {};
      for (const food of arr) {
        if (food.name && food._id) map[food.name] = food._id;
      }
      return map;
    } catch {
      return {};
    }
  };

  const fetchLocalStorage = useCallback(() => {
    const cachedNutrientsVersion = localStorage.getItem(NUTRIENTS_CACHE_VERSION_KEY);
    if (cachedNutrientsVersion !== NUTRIENTS_CACHE_VERSION) {
      localStorage.removeItem('nutrients');
      delete storageObjectCache.nutrients;
      localStorage.setItem(NUTRIENTS_CACHE_VERSION_KEY, NUTRIENTS_CACHE_VERSION);
    }

    const parsedNutrients = safeParseStorageObject('nutrients');
    const nutrients = normalizeNutrientNameMap(parsedNutrients);
    const usdaFoods = safeParseStorageObject('foods');
    const customFoodsRaw = localStorage.getItem('custom_foods_cache');
    const customFoodsMap = parseCustomFoodsCache(customFoodsRaw);

    if (JSON.stringify(nutrients) !== JSON.stringify(parsedNutrients)) {
      const raw = JSON.stringify(nutrients);
      localStorage.setItem('nutrients', raw);
      storageObjectCache.nutrients = { raw, parsed: nutrients };
    }

    setNutrients(nutrients);
    setFoods({ ...usdaFoods, ...customFoodsMap });

    const needsNutrients = Object.keys(nutrients).length === 0;
    const needsFoods = Object.keys(usdaFoods).length === 0;
    const needsCustomFoods = customFoodsRaw === null;

    if (needsNutrients || needsFoods || needsCustomFoods) {
      Promise.allSettled([
        needsNutrients ? request('/nutrients/all', 'GET') : Promise.resolve({ status: 200, body: nutrients }),
        needsFoods ? request('/food/all', 'GET') : Promise.resolve({ status: 200, body: usdaFoods }),
        needsCustomFoods ? request('/food/custom-foods', 'GET') : Promise.resolve({ status: 200, body: null }),
      ]).then(([nutrientsResult, foodsResult, customFoodsResult]) => {
        let resolvedUsda = usdaFoods;
        let resolvedCustom = customFoodsMap;

        if (nutrientsResult.status === 'fulfilled') {
          const res = nutrientsResult.value as { status: number; body: any };
          if (res.status === 200 && res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
            const normalized = normalizeNutrientNameMap(res.body);
            setNutrients(normalized);
            const raw = JSON.stringify(normalized);
            localStorage.setItem('nutrients', raw);
            storageObjectCache.nutrients = { raw, parsed: normalized };
          }
        }

        if (foodsResult.status === 'fulfilled') {
          const res = foodsResult.value as { status: number; body: any };
          if (res.status === 200 && res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
            resolvedUsda = res.body;
            const raw = JSON.stringify(res.body);
            localStorage.setItem('foods', raw);
            storageObjectCache.foods = { raw, parsed: res.body };
          }
        }

        if (customFoodsResult.status === 'fulfilled') {
          const res = customFoodsResult.value as { status: number; body: any };
          if (res.status === 200 && Array.isArray(res.body)) {
            localStorage.setItem('custom_foods_cache', JSON.stringify(res.body));
            resolvedCustom = parseCustomFoodsCache(JSON.stringify(res.body));
          }
        }

        setFoods({ ...resolvedUsda, ...resolvedCustom });
      });
    }
  }, [setFoods, setNutrients]);
  // const fetchFromEndpoints = async () => {
  //   setNutrients(await (await request('/nutrients/all', 'GET')).body)
  //   setFoods(await (await request('/food/all', 'GET')).body)
  // }
  return fetchLocalStorage;

}

export {accountInfoAtom,
        firstNameAtom,
        nutrientDetailsByIDAtom,
        nutrientDetailsByNameAtom,
        foodsAtom,
        useRefreshAccountInfo,
        editingPasswordAtom,
        useResetAccountAtoms,
      useFetchAutoFillData}
