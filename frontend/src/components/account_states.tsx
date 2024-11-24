import {
  atom,
  selector,
  useResetRecoilState,
  useRecoilState,
  useSetRecoilState,
} from 'recoil';
import { requirementsAtom } from './dashboard_states';
import { doWithData, request } from './endpoints';

interface AccountInfo{
  name : string,
  email: string;
  password : string;
}


const editingPasswordAtom = atom<boolean>({
  key: 'editingPassword',
  default: false
})

const accountInfoAtom = atom<AccountInfo>({
  key: 'accountInfo',
  default: {name : "",
            email : "",
            password : ""}
})


const addFoodsToLocalStorage = async () => {
  localStorage.setItem('foods', JSON.stringify(await (await request('/food/all', 'GET')).body))
}

const addNutrientsbyName = async () => {
  localStorage.setItem('nutrients', JSON.stringify(await (await request('/nutrients/all', 'GET')).body))
}

// you can only use hooks inside other hooks or inside components
function useRefreshAccountInfo() {
  const [info, setAccountInfo] = useRecoilState(accountInfoAtom);
  const fetchAutoFillData = useFetchAutoFillData();

  const refreshAccountInfo = async () => {
    // console.log("refreshing user info")
    fetchAutoFillData();
    doWithData('/user/info', setAccountInfo)
  }
  return refreshAccountInfo;
}

const firstNameAtom = selector<string>({
  key: 'firstName',
  get: ({get}) => {
    let firstName = get(accountInfoAtom).name.trim().split(' ')[0]
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

  const fetchLocalStorage = () => {
    setNutrients(JSON.parse(localStorage.getItem('nutrients') || ""))
    setFoods(JSON.parse(localStorage.getItem('foods') || ""))
  }
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