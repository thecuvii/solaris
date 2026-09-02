import { createFileRoute } from '@tanstack/react-router'

import { ShowcaseLayout } from '../showcase'

export const Route = createFileRoute('/_showcase')({ component: ShowcaseLayout })
