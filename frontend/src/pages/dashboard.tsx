/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState, useRef } from 'react'
import { LogList, LogProps} from '../components/Logs'
import { DateSelector, TimePeriod, RangeType, getCurrentPeriod} from '../components/DateSelector'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDashboard, NutrientStatsProps} from '../components/NutrientDash'
import { tolocalDateString } from '../components/utlis'



function Dashboard(){
  const [name, setName] = useState('user');
  /* for log list*/
  const [logs, setLogs] = useState<LogProps[]>([])


  /* for date selector */
  let now = new Date()
  const [dateRangeType, setDateRangeType] = useState<RangeType>(RangeType.default)
  const [dateRange, setDateRange] = useState<TimePeriod>(getCurrentPeriod())

  /* for dashboard */
  const [currentDay, setCurrentDay] = useState<Date>(new Date()) 

  const [dayIntake, setDayIntake] = useState< {[key: string]: number}>({});
  const [averageIntake, setAverageIntake] = useState<{[key: string]: number}>({});
  const [nutrientInfo, setNutrientInfo] = useState<{[key: string]: any}>({});

  const [rowData, setRowData] = useState<NutrientStatsProps[]>([]);

  const handleNextMonth = () => {
    if (dateRangeType === RangeType.default) {
      // Move to the next entire month
      setDateRange({
        start: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 1, 1),
        end: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() + 2, 0)
      });
    } else if (dateRangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end forward by the duration of the range
      setDateRange({
        start: new Date(dateRange.start.getTime() + rangeDuration),
        end: new Date(dateRange.end.getTime() + rangeDuration)
      });
    }
  };
  
  const handlePreviousMonth = () => {
    if (dateRangeType === RangeType.default) {
      // Move to the previous entire month
      setDateRange({
        start: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() - 1, 1),
        end: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 0)
      });
    } else if (dateRangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // Move both start and end backward by the duration of the range
      setDateRange({
        start: new Date(dateRange.start.getTime() - rangeDuration),
        end: new Date(dateRange.end.getTime() - rangeDuration)
      });
    }
  };
    

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsToLocalStorage = (nutrients : Record<string, string>) => {
    console.log("number of nutrients: " + String(Object.keys(nutrients).length))
    localStorage.setItem('nutrients', JSON.stringify(nutrients))
  }

  const refreshLogs = async () => {
    await doWithData('/logs/get?startDate=' 
                + tolocalDateString(dateRange.start)
                + '&endDate=' 
                + tolocalDateString(dateRange.end) + '', setLogs);
  };


  const refreshDayIntake = () => {
    let query = '/logs/day_intake?date=' 
                + tolocalDateString(currentDay)
    doWithData(query, setDayIntake);
  }
  

  const refreshAverageIntake = () => {
    doWithData('/logs/range_intake?startDate=' 
                + tolocalDateString(dateRange.start)
                + '&endDate=' 
                + tolocalDateString(dateRange.end) + '', setAverageIntake);
  }

  const refreshNutrientInfo = () => {
    doWithData('/requirements/all', setNutrientInfo);
    refreshAverageIntake()
    refreshDayIntake()

  }

  const combineData = () => {
    // Check if both pieces of data are available before combining
    if (Object.keys(nutrientInfo).length > 0) {
      const combined = Object.keys(nutrientInfo).map((nutrientId) => {
        const info = nutrientInfo[nutrientId]
        const day = dayIntake[nutrientId];
        const average = averageIntake[nutrientId];
  
        return {
          name: info.name,
          target: info.target,
          dayIntake: day,
          avgIntake: average,
          shouldExceed: info.should_exceed,
          units: info.units,
        };
      });
    setRowData(combined);
    }
  }


  useEffect(() => {
  }, [logs]);

  useEffect(() => {
    doWithData('/user/info', writeFirstName)
    refreshLogs()
    refreshNutrientInfo()
    refreshAverageIntake()
    refreshDayIntake()
    doWithData('/food/all_foods', addFoodsToLocalStorage, undefined, undefined, false)
    doWithData('/food/all_nutrients', addNutrientsToLocalStorage)
  }, []);
  
  // update row data if info, day intake, or averaged intake changes
  useEffect(() => {
    combineData()
  }, [dayIntake, averageIntake, nutrientInfo, currentDay, logs]);

  // if current Day changes, refresh the nutrition dashbarod
  useEffect(() => {
    refreshDayIntake();
    refreshAverageIntake();
  }, [currentDay, logs])

  // if start date or end date changes, refresh logs
  useEffect(() => {
    refreshAverageIntake();
    refreshLogs();
  }, [dateRange.start, dateRange.end])
  


  return(
  <StrictMode>
  <Header/>
  <Heading words = {'Hello, ' + name}/>


  <MainSection>
  <DateSelector startDate = {dateRange.start}
                endDate = {dateRange.end} 
                rangeType={dateRangeType}
                setRangeType={setDateRangeType}
                onNextMonth={handleNextMonth} 
                onPreviousMonth={handlePreviousMonth} 
                onDateChange={setDateRange}/>
  </MainSection>

  <MainSection>
    <NutrientDashboard  nutrientStats={rowData} 
                        currentDay={currentDay}
                        callAfterNewNutrient={refreshNutrientInfo}/>
  </MainSection>

  <MainSection>
    <div>
    <NewLogForm callAfterSubmitting={refreshLogs} />
   </div>
  </MainSection>

  <MainSection>
    <LogList  logs = {[...logs]} 
              callAfterSubmitting={refreshLogs}></LogList> 
  </MainSection>
  </StrictMode>) 

}


export default Dashboard