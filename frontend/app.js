const noteForm = document.getElementById('noteForm')
const noteBody = document.getElementById('noteBody')
const emptyMessage = document.getElementById('emptyMessage')
const notesGrid = document.getElementById('notesGrid')


async function getNotes() {
    const response = await fetch('https://week8.test/api/notes')
    const data = await response.json()
    showNotes(data.notes)
}

function showNotes(notes) {
    notesGrid.innerHTML = ''
    if (notes.length === 0) {
        emptyMessage.style.display = 'block'
        return
    }
    emptyMessage.style.display = 'none'
    for (let i = 0; i < notes.length; i++) {
        let note = notes[i]
        notesGrid.innerHTML += `
            <div class="noteBox">
                <p>${note.body}</p>
                <button onclick="deleteNote(${note.id})">Delete</button>
            </div>`
    }
}

noteForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = noteBody.value
    await fetch('https://week8.test/api/v1/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
    })

    noteBody.value = ''
    getNotes()
})

async function deleteNote(id) {
    await fetch(`https://week8.test/api/notes/${id}`, {
        method: 'DELETE'
    })
    getNotes()
}

getNotes()