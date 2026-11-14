import customFetch from "./customFetch.js"

export default {
    title:'Create Page',
    async getTemplate(){
        const response = await fetch('./views/create.html')
        return await response.text()
    },
    init(root,state){
        root.querySelector('#dbForm').addEventListener('submit',(e)=>{
            e.preventDefault()
            const dbName=e.target.elements.dbname.value
            return customFetch('/api/databases',{
                    method:'POST',
                    body:{dbName:dbName}
                })
                .then(response=>response.json())
                .then(result=>{
                    if(!result.data)alert('gagal!',result)
                    localStorage.setItem('dbName',result.data.name)
                    alert('data berhasil disimpan!')
                })
                .catch(error=>error)
            })

            const colinput=document.querySelector('#tabelinput').getElementsByTagName('tbody')[0]

            colinput.addEventListener('keydown',(e)=>{
                if(e.key === 'Enter'&& e.target.tagName === 'INPUT'){
                    const currentInput = e.target
                    const currentTd = currentInput.closest('td')
                    const currentTr = currentInput.closest('tr')
                    const cells = Array.from(currentTr.cells)
                    const currentCellIndex = cells.indexOf(currentTd)
                    const nextTd = cells[currentCellIndex +1]
                    if(nextTd&&nextTd.querySelector('input')){
                        nextTd.querySelector('input').focus()
                    }
                    else{
                        const nextTr=currentTr.nextElementSibling
                        if(nextTr&&nextTr.querySelector('input')){
                            nextTr.querySelector('input').focus()
                        }else{
                            document.querySelector('#create').focus()
                        }
                    }
                }
            })

            const inputCount=(count)=>{
                colinput.innerHTML=''
                for (let i = 0; i < count; i++) {
                    const newRow=colinput.insertRow()
                    const rowName=newRow.insertCell(0)
                    const rowType=newRow.insertCell(1)
                    const rowReq=newRow.insertCell(2)
                    const rowPk=newRow.insertCell(3)
                    const rowAi=newRow.insertCell(4)
                    const inputname=document.createElement('input')
                    const inputtype=document.createElement('input')
                    const inputreq=document.createElement('input')
                    const inputpk=document.createElement('input')
                    const inputai=document.createElement('input')
                    inputname.type='text'
                    inputname.id=`name_${i+1}`
                    inputname.name=`name_${i+1}`
                    rowName.appendChild(inputname)
                    inputtype.type='text'
                    inputtype.id=`type_${i+1}`
                    inputtype.name=`type_${i+1}`
                    rowType.appendChild(inputtype)
                    inputreq.type='checkbox'
                    inputreq.id=`req_${i+1}`
                    inputreq.name=`req_${i+1}`
                    rowReq.appendChild(inputreq)
                    inputpk.type='checkbox'
                    inputpk.id=`pk_${i+1}`
                    inputpk.name=`pk_${i+1}`
                    rowPk.appendChild(inputpk)
                    inputai.type='checkbox'
                    inputai.id=`ai_${i+1}`
                    inputai.name=`ai_${i+1}`
                    rowAi.appendChild(inputai)
                }
            }
            inputCount(1)
            const tableForm=document.querySelector('#table-form')
            const btnConfirm =tableForm.elements.confirm
            btnConfirm.addEventListener('click',()=>inputCount(tableForm.elements.colcount.value))
            tableForm.addEventListener('submit',async(e)=>{
                e.preventDefault();
                const tabelData= new FormData(e.target)
                const data = Object.fromEntries(tabelData.entries())
                const colData = []
                for (let i = 0; i < data.colcount ; i++) {
                    colData.push({
                        name:data[`name_${i+1}`],
                        type:data[`type_${i+1}`],
                        req:e.target.elements[`req_${i+1}`].checked,
                        pk:e.target.elements[`pk_${i+1}`].checked,
                        ai:e.target.elements[`ai_${i+1}`].checked,
                    })
                }
                const dbName=localStorage.getItem('dbName')
                try{
                    const response = await customFetch(`/api/db/${dbName}/tables`,{
                        method:'POST',
                        body:JSON.stringify({tableName:data.tablename})
                    })
                    if(!response.ok){alert('Tabel gagal dibuat');return}
                    
                    try {
                        const result = await customFetch(`/api/db/${dbName}/table/${data.tablename}/cols`,{
                            method:'POST',
                            headers:{
                                'Content-type':'application/json',
                                'Authorization':`Bearer ${localStorage.getItem('token')}`
                            },
                            body:colData
                        })
                        if(!result.ok)return alert('Gagal menyimpan')
                        alert('tabel dan kolom berhasil disimpan')
                            document.querySelector('#tablename').value=''
                            colinput.innerHTML=''
                            inputCount(1)
                            document.querySelector('#tablename').focus()
                    } catch (error) {console.error('Terjadi kesalahan server',error.message)}
                }catch(error){console.error('Terjadi kesalahan server',error.message)}
            })
        }
    }