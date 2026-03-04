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


const addFoodsToLocalStorage = async () => {
  localStorage.setItem('foods', JSON.stringify(await (await request('/food/all', 'GET')).body))
}

const addNutrientsbyName = async () => {
  localStorage.setItem('nutrients', JSON.stringify(await (await request('/nutrients/all', 'GET')).body))
}

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

const foodsAtom = atom<{[key : string] : number}>({
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
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn(`Invalid JSON in localStorage for '${key}', ignoring cached value.`);
    }
    return {};
  };

  const fetchLocalStorage = useCallback(() => {
    const nutrients = safeParseStorageObject('nutrients');
    const foods = safeParseStorageObject('foods');

    setNutrients(nutrients);
    setFoods(foods);

    const needsNutrients = Object.keys(nutrients).length === 0;
    const needsFoods = Object.keys(foods).length === 0;

    if (needsNutrients || needsFoods) {
      Promise.allSettled([
        needsNutrients ? request('/nutrients/all', 'GET') : Promise.resolve({ status: 200, body: nutrients }),
        needsFoods ? request('/food/all', 'GET') : Promise.resolve({ status: 200, body: foods }),
      ]).then(([nutrientsResult, foodsResult]) => {
        if (nutrientsResult.status === 'fulfilled') {
          const res = nutrientsResult.value as { status: number; body: any };
          if (res.status === 200 && res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
            setNutrients(res.body);
            localStorage.setItem('nutrients', JSON.stringify(res.body));
          }
        }

        if (foodsResult.status === 'fulfilled') {
          const res = foodsResult.value as { status: number; body: any };
          if (res.status === 200 && res.body && typeof res.body === 'object' && !Array.isArray(res.body)) {
            setFoods(res.body);
            localStorage.setItem('foods', JSON.stringify(res.body));
          }
        }
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
