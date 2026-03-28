declare const Zotero: any;

interface ZoteroBooleanPreference {
  value: boolean
}

class Options { // tslint:disable-line:variable-name
  public updatePreferenceWindow(which: string) {
    Zotero.debug(`Zotodo: updatePreferenceWindow called with '${which}'`)
    switch (which) {
      case 'init-all':
        this.disablePref('include_note', 'note-format', false)
        this.disablePref('set_due', 'due-string', false)
        break
      case 'include_note':
        this.disablePref('include_note', 'note-format', true)
        break
      case 'set_due':
        this.disablePref('set_due', 'due-string', true)
        break
      default:
        Zotero.logError(`Unexpected preference value: ${which}`)
    }
  }

  private disablePref(setting_name: string, to_disable: string, revert: boolean) {
    let setting_val: boolean = (document.getElementById(
      setting_name
    ) as unknown as ZoteroBooleanPreference).value
    if (revert) {
      setting_val = !setting_val
    }

    Zotero.debug(`Zotodo: disablePref setting='${setting_name}', target='${to_disable}', enabled=${setting_val}`)
    (document.getElementById(
      `id-zotodo-${to_disable}`
    ) as HTMLInputElement).disabled = !setting_val
  }
}

if (!Zotero.Zotodo.Options) Zotero.Zotodo.Options = new Options
