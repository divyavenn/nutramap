import {
  atom,
  selector,
  useResetRecoilState,
  useRecoilState
} from 'recoil';
import { doWithData } from './endpoints';


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


// you can only use hooks inside other hooks or inside components
function useRefreshAccountInfo() {
  const [info, setAccountInfo] = useRecoilState(accountInfoAtom)
  const refreshAccountInfo = () => {
    console.log("refreshing user info")
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
  const resetAtoms = () => {
    useResetRecoilState(accountInfoAtom)();
    useResetRecoilState(editingPasswordAtom)();
  }
  return resetAtoms
}

export {accountInfoAtom, firstNameAtom, useRefreshAccountInfo, editingPasswordAtom, useResetAccountAtoms}