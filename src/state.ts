class PendingState {
  private pending = new Set<string>()

  track(id: string): boolean {
    if (this.pending.has(id)) return false
    this.pending.add(id)
    return true
  }

  resolve(id: string): void {
    this.pending.delete(id)
  }

  isPending(id: string): boolean {
    return this.pending.has(id)
  }

  get pendingCount(): number {
    return this.pending.size
  }

  clear(): void {
    this.pending.clear()
  }
}

export class PermissionState extends PendingState {}
export class QuestionState extends PendingState {}
