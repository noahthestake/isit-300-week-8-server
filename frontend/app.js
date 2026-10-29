async function getNotes() {
    const response = await fetch('https://week8.test/api/notes')
    const data = await response.json()
    showNotes(data.notes)
}