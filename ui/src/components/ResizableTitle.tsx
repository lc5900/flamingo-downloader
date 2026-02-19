import type React from 'react'
import { Resizable } from 'react-resizable'

export type ResizeableHeaderProps = React.HTMLAttributes<HTMLElement> & {
  onResize?: (e: unknown, data: { size: { width: number; height: number } }) => void
  width?: number
}

export function ResizableTitle(props: ResizeableHeaderProps) {
  const { onResize, width, ...rest } = props
  if (!width) {
    return <th {...rest} />
  }
  return (
    <Resizable
      width={width}
      height={0}
      handle={<span className="resize-handle" onClick={(e) => e.stopPropagation()} />}
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...rest} />
    </Resizable>
  )
}
