import {
  atom,
  selector,
  useSetRecoilState,
  useRecoilValue,
} from 'recoil';


interface AccountInfo{
  name : string,
  email: string;
  _id : string;
}

const accountInfoAtom = atom<AccountInfo>({
  key: 'accountInfo',
  default: {name : "user lastName",
            email : "user@domain.com",
            _id : "arstdneio"}
})

const firstNameAtom =  selector<string>({
  key: 'firstName',
  get: ({get}) => {
    let name = get(accountInfoAtom).name
    return name.trim().split(' ')[0]
  }
})

export {accountInfoAtom, firstNameAtom}