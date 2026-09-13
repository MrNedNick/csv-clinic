import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImportPanel } from './ImportPanel'

const fixtureFiles = import.meta.glob('../../../test/fixtures/01-import/*.csv', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const fixture = (name: string) => fixtureFiles[`../../../test/fixtures/01-import/${name}`]

function uploadFile(content: string, name: string) {
  const input = screen.getByLabelText('Open CSV') as HTMLInputElement
  const file = new File([content], name, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImportPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('shows an empty state before anything is imported', () => {
    render(<ImportPanel />)
    expect(screen.getByText(/no file loaded yet/i)).toBeInTheDocument()
  })

  it('imports a CSV and shows a preview table', async () => {
    render(<ImportPanel />)
    uploadFile(fixture('simple.csv'), 'simple.csv')

    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Alice' })).toBeInTheDocument()
    expect(screen.getByText(/simple\.csv/)).toBeInTheDocument()
    expect(screen.getByText(/2 rows, 3 columns/)).toBeInTheDocument()
  })

  it('strips a UTF-8 BOM so it does not end up glued to the first header cell', async () => {
    render(<ImportPanel />)
    uploadFile(fixture('with-bom.csv'), 'with-bom.csv')

    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /﻿/ })).not.toBeInTheDocument()
  })

  it('shows a distinguishable error for a row with the wrong number of columns', async () => {
    render(<ImportPanel />)
    uploadFile(fixture('inconsistent-rows.csv'), 'inconsistent-rows.csv')

    expect(await screen.findByRole('alert')).toHaveTextContent('Row 2 has 1 column, expected 2.')
  })

  it('shows a distinguishable error for an empty file', async () => {
    render(<ImportPanel />)
    uploadFile(fixture('empty.csv'), 'empty.csv')

    expect(await screen.findByRole('alert')).toHaveTextContent('no rows to import')
  })

  it('restores the last import after a reload', async () => {
    const { unmount } = render(<ImportPanel />)
    uploadFile(fixture('simple.csv'), 'simple.csv')
    await screen.findByRole('columnheader', { name: 'name' })
    unmount()

    render(<ImportPanel />)
    expect(await screen.findByRole('columnheader', { name: 'name' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Alice' })).toBeInTheDocument()
  })

  it('clears the stored import and returns to the empty state', async () => {
    render(<ImportPanel />)
    uploadFile(fixture('simple.csv'), 'simple.csv')
    await screen.findByRole('columnheader', { name: 'name' })

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText(/no file loaded yet/i)).toBeInTheDocument()

    render(<ImportPanel />)
    await waitFor(() => expect(localStorage.getItem('csv-clinic:last-dataset')).toBeNull())
  })
})
