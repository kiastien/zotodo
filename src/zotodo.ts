declare const Zotero: any
declare const Services: any
declare const Components: any;
const { classes: Cc, interfaces: Ci } = Components;

const monkey_patch_marker = 'ZotodoMonkeyPatched'
const MAX_PRIORITY = 5
const ADDON_ID = 'zotodov8@zotero.org'
const WINDOW_OBSERVER_NAME = 'Zotodo-window-observer'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-inner-declarations, prefer-arrow/prefer-arrow-functions
function patch(object: any, method: string, patcher: (original: any) => any) {
  Zotero.debug(`Zotodo: patch requested for method '${method}'`)
  if (object[method][monkey_patch_marker]) return
  object[method] = patcher(object[method])
  object[method][monkey_patch_marker] = true
  Zotero.debug(`Zotodo: patch applied for method '${method}'`)
}

function getPref(pref_name: string): any {
  Zotero.debug(`Zotodo: Getting preference ${pref_name}`);
  return Zotero.Prefs.get(`extensions.zotodo.${pref_name}`, true)
}

function showError(err: string, progWin?: object) {
  show(
    'chrome://zotero/skin/cross.png',
    'Failed to make task for item!',
    err,
    progWin,
    true
  )
}

function showSuccess(task_data: TaskData, progWin?: object) {
  show(
    'chrome://zotero/skin/tick.png',
    'Made task for item!',
    `Created task "${task_data.contents}" in project ${task_data.project_name}`,
    progWin,
    true
  )
}

const NOTIFICATION_DURATION = 3000

function show(
  icon: string,
  headline: string,
  body: string,
  win?: object,
  done = false,
  duration = NOTIFICATION_DURATION
) {
  const progressWindow =
    win || new Zotero.ProgressWindow({ closeOnClick: true })
  progressWindow.changeHeadline(`Zotodo: ${headline}`, icon)
  progressWindow.addLines([body], [icon])
  if (win == null) {
    progressWindow.show()
  }

  if (done) {
    progressWindow.startCloseTimer(duration)
  }

  return progressWindow as object
}

interface ZoteroCreator {
  firstName: string
  lastName: string
  fieldMode: number
  creatorTypeID: number
}

interface ZoteroItem {
  key: string
  itemType: string
  libraryID: number
  id: number
  itemTypeID: number
  getField(
    field: string,
    unformatted?: boolean,
    includeBaseMapped?: boolean
  ): any
  getCollections(): number[]
  getAttachments(): number[]
  getCreators(): ZoteroCreator[]
}

interface TodoistApiItem {
  name: string
  id: number
}

class TaskData {
  public contents: string
  public note: string = null
  public due_string: string = null
  public project_name: string
  public section_name: string = null
  public priority: number
  public label_names: string[]
  constructor(
    contents: string,
    priority: number,
    project_name: string,
    label_names: string[]
  ) {
    this.contents = contents
    this.priority = priority
    this.project_name = project_name
    this.label_names = label_names
  }
}

class TodoistAPI {
  private token: string = null
  private projects: Record<string, number> = null
  private labels: Record<string, number> = null
  private sections: Record<string, Record<string, number>> = {}

  constructor(token: string) {
    this.token = token
    Zotero.debug(`Zotodo: TodoistAPI initialized (tokenProvided=${token != null && token !== ''})`)
  }

  public async createTask(task_data: TaskData) {
    const icon = `chrome://zotero/skin/spinner-16px${Zotero.hiDPI ? '@2x' : ''
    }.png`
    const progWin = show(icon, 'Creating task', 'Making Todoist task for item')
    Zotero.debug(`Zotodo: createTask started (project='${task_data.project_name}', section='${task_data.section_name || ''}', labels=${task_data.label_names.length})`)
    if (this.token == null || this.token === '') {
      this.token = getPref('todoist_token')
      Zotero.debug(`Zotodo: Refreshed Todoist token from prefs (present=${this.token != null && this.token !== ''})`)
    }

    const project_id = await this.getProjectId(task_data.project_name, progWin)
    if (project_id == null) {
      Zotero.debug(`Zotodo: Unable to resolve project '${task_data.project_name}'`)
      return
    }
    Zotero.debug(`Zotodo: Resolved project '${task_data.project_name}' -> ${project_id}`)

    let section_id = null
    if (task_data.section_name != null) {
      section_id = await this.getSectionId(
        task_data.section_name,
        task_data.project_name,
        progWin
      )
      if (section_id == null) {
        Zotero.debug(`Zotodo: Unable to resolve section '${task_data.section_name}'`)
        return
      }
      Zotero.debug(`Zotodo: Resolved section '${task_data.section_name}' -> ${section_id}`)
    }

    const label_ids = []
    for (const label_name of task_data.label_names) {
      const label_id = await this.getLabelId(label_name, progWin)
      if (label_id == null) {
        Zotero.debug(`Zotodo: Unable to resolve label '${label_name}'`)
        return
      }

      label_ids.push(label_id)
      Zotero.debug(`Zotodo: Resolved label '${label_name}' -> ${label_id}`)
    }

    const createPayload: { [k: string]: any } = {
      content: task_data.contents,
      project_id,
      priority: task_data.priority,
    }

    if (label_ids.length > 0) {
      createPayload.label_ids = label_ids
    }

    if (section_id != null) {
      createPayload.section_id = section_id
    }

    if (task_data.due_string != null) {
      createPayload.due_string = task_data.due_string
    }

    const createHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const createResponse = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
      'POST',
      'https://api.todoist.com/rest/v2/tasks',
      {
        headers: createHeaders,
        body: JSON.stringify(createPayload),
      }
    )

    if (!createResponse.ok) {
      const err = createResponse.text // Access response text directly
      const msg = `Error creating task: ${createResponse.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return
    }
    Zotero.debug(`Zotodo: Task created successfully for '${task_data.contents}'`)

    if (task_data.note != null) {
      const task_id = (JSON.parse(createResponse.text as string)).id // Parse response text
      const notePayload = {
        content: task_data.note,
        task_id,
      }

      const noteHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      }

      const noteResponse = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
        'POST',
        'https://api.todoist.com/rest/v2/comments',
        {
          headers: noteHeaders,
          body: JSON.stringify(notePayload),
        }
      )

      if (!noteResponse.ok) {
        const err = noteResponse.text
        const msg = `Error adding comment: ${noteResponse.statusText} ${err}`
        showError(msg, progWin)
        Zotero.logError(msg)
        return
      }
      Zotero.debug(`Zotodo: Note/comment added for created task '${task_data.contents}'`)
    }
    showSuccess(task_data, progWin)
    Zotero.debug(`Zotodo: createTask finished successfully for '${task_data.contents}'`)
  }

  private async getSectionId(
    section_name: string,
    project_name: string,
    progress_win: object
  ): Promise<number | null> {
    Zotero.debug(`Zotodo: getSectionId('${section_name}', project='${project_name}')`)
    if (this.sections[project_name] === undefined) {
      const project_sections = await this.getSections(
        project_name,
        progress_win
      )
      if (project_sections == null) {
        showError('Failed to get sections!', progress_win)
        return null
      }

      this.sections[project_name] = project_sections
      Zotero.debug(`Zotodo: Cached ${Object.keys(project_sections).length} sections for project '${project_name}'`)
    }

    if (!(section_name in this.sections[project_name])) {
      const section_result = await this.createSection(
        section_name,
        project_name,
        progress_win
      )

      if (!section_result) {
        return null
      }
      Zotero.debug(`Zotodo: Created missing section '${section_name}' in '${project_name}'`)
    }

    return this.sections[project_name][section_name]
  }

  private async getProjectId(
    project_name: string,
    progress_win: object
  ): Promise<number | null> {
    Zotero.debug(`Zotodo: getProjectId('${project_name}')`)
    if (this.projects == null) {
      this.projects = await this.getProjects(progress_win)
      if (this.projects == null) {
        showError('Failed to get projects!', progress_win)
        return null
      }
      Zotero.debug(`Zotodo: Project cache initialized with ${Object.keys(this.projects).length} project(s)`)
    }

    if (!(project_name in this.projects)) {
      const project_result = await this.createProject(
        project_name,
        progress_win
      )
      if (!project_result) {
        return null
      }
      Zotero.debug(`Zotodo: Created missing project '${project_name}'`)
    }

    return this.projects[project_name]
  }

  private async getLabelId(
    label_name: string,
    progress_win: object
  ): Promise<number | null> {
    Zotero.debug(`Zotodo: getLabelId('${label_name}')`)
    if (this.labels == null) {
      this.labels = await this.getLabels(progress_win)

      if (this.labels == null) {
        showError('Failed to get labels!', progress_win)
        return null
      }
      Zotero.debug(`Zotodo: Label cache initialized with ${Object.keys(this.labels).length} label(s)`)
    }

    if (!(label_name in this.labels)) {
      const label_result = await this.createLabel(label_name, progress_win)
      if (!label_result) {
        return null
      }
      Zotero.debug(`Zotodo: Created missing label '${label_name}'`)
    }

    return this.labels[label_name]
  }

  private async createSection(
    section_name: string,
    project_name: string,
    progWin: object
  ): Promise<boolean> {
    Zotero.debug(`Zotodo: Creating section '${section_name}' in project '${project_name}'`)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const project_id = await this.getProjectId(project_name, progWin)
    if (project_id == null) {
      return false // Added return false based on type hint
    }

    const payload = { name: section_name, project_id }
    const response = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
      'POST',
      'https://api.todoist.com/rest/v2/sections',
      {
        headers,
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const err = response.text
      const msg = `Error creating section ${section_name} in project ${project_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = JSON.parse(response.text as string)
    if (!this.sections[project_name]) this.sections[project_name] = {}
    this.sections[project_name][data.name] = data.id
    Zotero.debug(`Zotodo: Section created '${data.name}' -> ${data.id}`)

    return true
  }

  private async createProject(
    project_name: string,
    progWin: object
  ): Promise<boolean> {
    Zotero.debug(`Zotodo: Creating project '${project_name}'`)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const payload = { name: project_name }
    const response = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
      'POST',
      'https://api.todoist.com/rest/v2/projects',
      {
        headers,
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const err = response.text
      const msg = `Error creating project ${project_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = JSON.parse(response.text as string)
    if (!this.projects) this.projects = {}
    this.projects[data.name] = data.id
    Zotero.debug(`Zotodo: Project created '${data.name}' -> ${data.id}`)

    return true
  }

  private async createLabel(
    label_name: string,
    progWin: object
  ): Promise<boolean> {
    Zotero.debug(`Zotodo: Creating label '${label_name}'`)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const payload = { name: label_name }
    const response = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
      'POST',
      'https://api.todoist.com/rest/v2/labels',
      {
        headers,
        body: JSON.stringify(payload),
      }
    )

    if (!response.ok) {
      const err = response.text
      const msg = `Error creating label ${label_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = JSON.parse(response.text as string)
    if (!this.labels) this.labels = {}
    this.labels[data.name] = data.id
    Zotero.debug(`Zotodo: Label created '${data.name}' -> ${data.id}`)

    return true
  }

  private async getAll(
    endpoint: string,
    progWin: object
  ): Promise<Record<string, number> | null> {
    Zotero.debug(`Zotodo: Fetching Todoist endpoint '${endpoint}'`)
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const response = await Zotero.HTTP.request( // Use Zotero.HTTP for Z7
      'GET',
      endpoint,
      {
        headers,
      }
    )

    if (!response.ok) {
      const err = response.text
      const msg = `Error requesting from ${endpoint}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return null
    }

    const data = JSON.parse(response.text as string) as TodoistApiItem[]
    const items: { [k: string]: number } = {}
    for (const item of data) {
      items[item.name] = item.id
    }
    Zotero.debug(`Zotodo: Endpoint '${endpoint}' returned ${Object.keys(items).length} item(s)`)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return items
  }

  private async getSections(
    project_name: string,
    progWin: object
  ): Promise<Record<string, number> | null> {
    const project_id = await this.getProjectId(project_name, progWin)
    if (project_id == null) {
      return null
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.getAll(
      `https://api.todoist.com/rest/v2/sections?project_id=${project_id}`,
      progWin
    )
  }

  private async getProjects(progWin: object): Promise<Record<string, number> | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.getAll('https://api.todoist.com/rest/v2/projects', progWin)
  }

  private async getLabels(progWin: object): Promise<Record<string, number>> {
    return this.getAll('https://api.todoist.com/rest/v2/labels', progWin)
  }
}

export class Zotodo {
  private todoist: TodoistAPI
  public notifierID: any = null // Stored notifier ID

  // Called from startup
  public init() {
    Zotero.debug('Zotodo: Initializing Zotodo instance')
    const todoist_token: string = getPref('todoist_token')
    this.todoist = new TodoistAPI(todoist_token)
    Zotero.debug('Zotodo: set up Todoist API instance')

    // Register notifier
    // The Zotero.Notifier.registerObserver is correct for Z7 as well
    this.notifierID = Zotero.Notifier.registerObserver(
      this.notifierCallback,
      ['item'],
      'Zotodo-item-observer' // Unique observer name
    )
    Zotero.debug(`Zotodo: notifier registered with ID ${String(this.notifierID)}`)
  }

  private notifierCallback: any = { // Made 'any' to match Zotero typings
    notify: (event: string, type: string, ids: number[], _extraData?: object) => {
      Zotero.debug(`Zotodo: notifier event='${event}' type='${type}' ids=${ids.join(',')}`)
      if (getPref('automatic_add') && type === 'item' && event === 'add') {
        const items = Zotero.Items.get(ids)
          .map((item: ZoteroItem) => {
            // Ensure itemType is populated if not already a string
            if (typeof item.itemTypeID === 'number' && !item.itemType) {
              item.itemType = Zotero.ItemTypes.getName(item.itemTypeID)
            }
            return item
          })
          .filter(
            (item: ZoteroItem) =>
              item.itemType !== 'attachment' && item.itemType !== 'note'
          )

        for (const item of items) {
          Zotero.debug(`Zotodo: Making task for ${item.getField('title')}`) // Use Zotero.debug
          void this.makeTaskForItem(item as ZoteroItem); // Removed Zotero.Zotodo
        }
      }
      else {
        Zotero.debug('Zotodo: notifier event ignored by current preference/event filters')
      }
    },
  }

  public openPreferenceWindow(paneID?: any, action?: any) {
    Zotero.debug(`Zotodo: openPreferenceWindow called (pane=${String(paneID)}, action=${String(action)})`)
    const win = Zotero.getMainWindow() // Get main window reference
    if (!win) {
      Zotero.logError('Zotodo: Could not get main window to open preferences')
      return
    }
    const io = { pane: paneID, action }
    win.openDialog(
      'chrome://zotodo/content/options.xhtml',
      'zotodo-options',
      `chrome,titlebar,toolbar,centerscreen${Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal'}`,
      io
    )
    Zotero.debug('Zotodo: preferences dialog opened')
  }

  public makeTaskForSelectedItems() {
    Zotero.debug('Zotodo: makeTaskForSelectedItems called')
    const pane = Zotero.getActiveZoteroPane()
    if (!pane) {
      Zotero.logError('Zotodo: Could not get active Zotero pane.')
      return
    }
    const items = pane
      .getSelectedItems()
      .map((item: any /* ZoteroItem has no itemTypeID directly */) => { // Ensure items are full Zotero items
        if (typeof item === 'number') return Zotero.Items.get(item) // If only ID is returned, get full item
        if (typeof item.itemTypeID === 'number' && !item.itemType) { // Similar to notifier
          item.itemType = Zotero.ItemTypes.getName(item.itemTypeID)
        }
        return item
      })
      .filter(
        (item: ZoteroItem) =>
          item.itemType !== 'attachment' &&
          item.itemType !== 'note'
      )
    Zotero.debug(`Zotodo: ${items.length} selected item(s) eligible for task creation`)

    for (const item of (items as ZoteroItem[])) {
      void this.makeTaskForItem(item)
    }
  }

  private async makeTaskForItem(item: ZoteroItem) {
    Zotero.debug(`Zotodo: makeTaskForItem started for item key='${item.key}'`)
    const due_string: string = getPref('due_string')
    const label_names_string: string = getPref('labels') as string
    let label_names: string[] = []
    if (label_names_string !== '') {
      label_names = label_names_string.split(',')
    }

    const ignore_collections_string: string = getPref('ignore_collections') as string
    const ignore_collections: string[] = ignore_collections_string ? ignore_collections_string.split(',') : []

    const priority: number = MAX_PRIORITY - getPref('priority')
    const project_name: string = getPref('project')
    const section_name: string = getPref('section')

    const set_due: boolean = getPref('set_due')
    const include_note: boolean = getPref('include_note')
    const note_format: string = getPref('note_format')
    const task_format: string = getPref('task_format')
    Zotero.debug(`Zotodo: Preference snapshot loaded (project='${project_name}', section='${section_name}', include_note=${include_note}, set_due=${set_due})`)

    const item_collections = item
      .getCollections()
      .map(id => Zotero.Collections.get(id).name as string)
    for (const ignored_name of ignore_collections) {
      if (item_collections.includes(ignored_name.trim())) { // Added trim
        Zotero.debug(`Zotodo: Item "${item.getField('title')}" in ignored collection "${ignored_name.trim()}", skipping.`)
        return
      }
    }

    const title: string = item.getField('title', false, true) || ''
    const abstract: string = item.getField('abstractNote', false, true) || ''
    const url: string = item.getField('url', false, true) || ''
    const doi: string = item.getField('DOI', false, true) || ''
    let pdf_path = ''
    let pdf_id = '' // Changed to string for consistency with Z7 URIs
    const attachments: any[] = item.getAttachments().map(id => Zotero.Items.get(id)) // Get full attachment items
    if (attachments.length > 0) {
      for (const attachment of attachments) {
        if (attachment.attachmentContentType === 'application/pdf') {
          pdf_path = attachment.attachmentPath || ''
          pdf_id = attachment.key || '' // Use key for URI
          Zotero.debug(`Zotodo: PDF attachment detected for item key='${item.key}' (attachment='${pdf_id}')`)
          break
        }
      }
    }

    const author_type_id: number = Zotero.CreatorTypes.getPrimaryIDForType(
      item.itemTypeID
    )

    const author_names: string[] = item
      .getCreators()
      .filter(
        (creator: ZoteroCreator) => creator.creatorTypeID === author_type_id
      )
      .map(
        (creator: ZoteroCreator) => `${creator.firstName || ''} ${creator.lastName || ''}`.trim() // Handle missing names
      )

    let et_al = ''
    if (author_names.length > 0) {
      et_al = `${author_names[0]} et al.`
    }

    const authors = author_names.join(', ')
    const item_id = item.key
    let library_path = 'library'
    const library = Zotero.Libraries.get(item.libraryID)
    if (library && library.libraryType === 'group') { // Check if library exists
      library_path = Zotero.URI.getLibraryPath(item.libraryID)
    }

    const select_uri = `zotero://select/${library_path}/items/${item_id}`
    let open_uri = ''
    if (pdf_id !== '') { open_uri = `zotero://open-pdf/${library_path}/items/${pdf_id}` }
    let citekey = ''
    if (
      Zotero.BetterBibTeX && // Check for BBT existence
      Zotero.BetterBibTeX.KeyManager
    ) {
      const bbtItem = Zotero.BetterBibTeX.KeyManager.get(item.id) // BBT uses item.id (integer)
      if (bbtItem && bbtItem.citekey) {
        citekey = bbtItem.citekey
      }
    }
    Zotero.debug(`Zotodo: Token context built (hasPdf=${pdf_id !== ''}, hasCitekey=${citekey !== ''}, authors=${author_names.length})`)

    const tokens: Record<string, string | number> = { // Ensure specific types if needed, but string is fine for templating
      title,
      abstract,
      url,
      doi,
      pdf_path,
      pdf_id,
      et_al,
      authors,
      library_path,
      item_id,
      select_uri,
      open_uri,
      citekey,
    }

    // Replace eval with safer template substitution
    const replaceTokens = (template: string, data: Record<string, any>): string => {
      // Conditional blocks: ?${token}:value?
      template = template.replace(/\?\$\{([^}]+)\}:([^?]*)\?/g, (match: string, token: string, value: string): string => data[token] ? value : '')
      // Conditional blocks: !${token}:value!
      template = template.replace(/!\$\{([^}]+)\}:([^!]*)!/g, (match: string, token: string, value: string): string => !data[token] ? value : '')
      // Regular tokens: ${token}
      template = template.replace(/\$\{([^}]+)\}/g, (match: string, token: string): string => String(data[token] || ''))
      return template
    }

    const note_contents: string = replaceTokens(note_format, tokens)
    const task_contents: string = replaceTokens(task_format, tokens)
    Zotero.debug(`Zotodo: Rendered task content length=${task_contents.length}, note length=${note_contents.length}`)

    const task_data = new TaskData(
      task_contents,
      priority,
      project_name,
      label_names
    )

    if (include_note) {
      task_data.note = note_contents
    }

    if (set_due) {
      task_data.due_string = due_string
    }

    if (section_name !== '') {
      task_data.section_name = section_name
    }

    await this.todoist.createTask(task_data)
    Zotero.debug(`Zotodo: makeTaskForItem completed for item key='${item.key}'`)
  }

  // Methods for window load/unload, can be expanded if menu items need specific handling
  public onWindowLoad(window: any) {
    Zotero.debug('Zotodo: onWindowLoad')
    // Placeholder for adding menu items or other window-specific logic
    // Example: this.addMenuItems(window);
  }

  public onWindowUnload(window: any) {
    Zotero.debug('Zotodo: onWindowUnload')
    // Placeholder for removing menu items or other window-specific cleanup
    // Example: this.removeMenuItems(window);
  }
}

