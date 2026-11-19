import customFetch from "./customFetch.js"
const start=async()=>{
    const fetchDb = await customFetch(`/api/databases`)
    const jsonData= await fetchDb.json()
    const databases = jsonData.data
    const listDbWrap = document.querySelector('#list-db')
    const listDb = document.createElement('ul')
    listDb.style.cssText="list-style:'|_';cursor:pointer"
    if(databases&&databases.length>0){
        databases.map(db=>{
            const listItem=document.createElement('li')
            listItem.textContent=db.name
            listDb.appendChild(listItem)
            const listTables = document.createElement('ul')
            listTables.style.cssText='list-style:"|_";display:none'
            listTables.classList=`${db.name}-tables`
            listItem.addEventListener('click',()=>{
                const table=document.querySelector(`.${db.name}-tables`)
                if(table.style.display === 'none'){
                    table.style.display='block'
                }else{table.style.display='none'}
            })
            db.tables.map(t=>{
                const item = document.createElement('li')
                item.textContent=t
                listTables.appendChild(item)
            })
            listItem.appendChild(listTables)
        })
        listDbWrap.appendChild(listDb)
    }
}
if(typeof window !== 'undefined')start()