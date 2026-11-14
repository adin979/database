export default{
    title:'Home Page',
    async getTemplate(){
        const temp =await fetch('./views')
        return (await temp).text()
    },
    init(root,state){

    }
}