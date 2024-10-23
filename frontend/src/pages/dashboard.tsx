/// <reference types="vite-plugin-svgr/client" />
import { StrictMode, useEffect, useState, useRef } from 'react'
import { LogList, LogProps} from '../components/Logs'
import { DateSelector, TimePeriod, RangeType} from '../components/DateSelector'

import {doWithData} from '../components/LoadHtml'
import {Heading} from '../components/Title'
import {Header, MainSection} from '../components/Sections'
import { NewLogForm } from '../components/AddLogForm' 
import { NutrientDashboard, NutrientStatsProps} from '../components/NutrientDash'



function tolocalDateString (date : Date) {
  return date.getFullYear() + '-' +
  String(date.getMonth() + 1).padStart(2, '0') + '-' +
  String(date.getDate()).padStart(2, '0') + 'T' +
  String(date.getHours()).padStart(2, '0') + ':' +
  String(date.getMinutes()).padStart(2, '0') + ':' +
  String(date.getSeconds()).padStart(2, '0');
}
function Dashboard(){
  const [name, setName] = useState('user');
  /* for log list*/
  const [logs, setLogs] = useState<LogProps[]>([])


  /* for date selector */
  let now = new Date()
  const [dateRangeType, setDateRangeType] = useState<RangeType>(RangeType.custom)
  const [dateRange, setDateRange] = useState<TimePeriod>(
    { 
      start: (new Date(now.getFullYear(), now.getMonth(), 1)), 
      end: (new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    })

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
      // If the range is less than a year, increment the range by the same duration
      setDateRange ({
          start: new Date(dateRange.start.getTime() + rangeDuration),
          end: new Date(dateRange.end.getTime() + rangeDuration)
        });
      }
    }

  const handlePreviousMonth = () => {
    if (dateRangeType === RangeType.default) {
      // Move to the next entire month
      setDateRange({
        start: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 0),
        end: new Date(dateRange.start.getFullYear(), dateRange.start.getMonth() - 1, 1)
      });
    } else if (dateRangeType === RangeType.custom) {
      // Calculate the difference between the start and end dates in milliseconds
      const rangeDuration = dateRange.end.getTime() - dateRange.start.getTime();
      // If the range is less than a year, increment the range by the same duration
      setDateRange ({
          start: new Date(dateRange.start.getTime() - rangeDuration),
          end: new Date(dateRange.end.getTime() - rangeDuration)
        });
      }
  }
    

  const writeFirstName = (userData : any) => {
    setName(userData.name.trim().split(' ')[0])
  }

  const addFoodsToLocalStorage = (foods : Record<string, string>) => {
    localStorage.setItem('foods', JSON.stringify(foods))
  }

  const addNutrientsToLocalStorage = (nutrients : Record<string, string>) => {
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
    doWithData('/requirements/requirement_info', setNutrientInfo);
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
    combineData()
  }, []);
  
  // update row data if info, day intake, or averaged intake changes
  useEffect(() => {
    combineData()
  }, [dayIntake, averageIntake, nutrientInfo, currentDay, logs]);

  // if current Day changes, refresh the nutrition dashbarod
  useEffect(() => {
    refreshDayIntake();
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
  <DateSelector startDate={dateRange.start} 
                endDate={dateRange.end} 
                rangeType={dateRangeType}
                onNextMonth={handleNextMonth} 
                onPreviousMonth={handlePreviousMonth} 
                onDateChange={setDateRange}/>
  </MainSection>

  <MainSection>
    <NutrientDashboard  nutrientStats={rowData} 
                        currentDay={currentDay}/>
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