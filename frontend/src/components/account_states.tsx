import {
  atom,
  selector,
  useSetRecoilState,
  useResetRecoilState
} from 'recoil';
import { request } from './endpoints';
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

function useRefreshAccountInfo() {
  const setAccountInfo = useSetRecoilState(accountInfoAtom)
  const refreshAccountInfo = () => {
    doWithData('/user/info', setAccountInfo)
  }
  return refreshAccountInfo;

}
const firstNameAtom =  selector<string>({
  key: 'firstName',
  get: ({get}) => {
    let name = get(accountInfoAtom).name
    return name.trim().split(' ')[0]
  }
})

const resetAccountAtoms = () => { 
  useResetRecoilState(accountInfoAtom)();
  useResetRecoilState(editingPasswordAtom)();
}

export {accountInfoAtom, firstNameAtom, useRefreshAccountInfo, editingPasswordAtom, resetAccountAtoms}