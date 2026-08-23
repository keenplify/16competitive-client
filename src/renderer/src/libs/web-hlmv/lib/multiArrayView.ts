export class MultiArrayView<T> {
  readonly array: ArrayLike<T> & { [index: number]: T }
  readonly shape: number[]
  private readonly strides: number[]

  constructor(array: ArrayLike<T> & { [index: number]: T }, shape: number[], offset = 0) {
    if (shape.length === 0 || offset < 0) {
      throw new TypeError('Invalid multi-dimensional array shape')
    }

    this.array = array
    this.shape = shape
    this.strides = []

    let stride = 1
    for (let index = shape.length - 1; index >= 0; index--) {
      this.strides[index] = stride
      stride *= shape[index]
    }

    this.offset = offset
  }

  private readonly offset: number

  static create<T>(
    shape: number[],
    Constructor: new (length: number) => ArrayLike<T> & { [index: number]: T }
  ): MultiArrayView<T> {
    const length = shape.reduce((total, size) => total * size, 1)
    return new MultiArrayView(new Constructor(length), shape)
  }

  get(...path: number[]): T {
    return this.array[this.getIndex(...path)]
  }

  set(value: T, ...path: number[]): void {
    this.array[this.getIndex(...path)] = value
  }

  getIndex(...path: number[]): number {
    if (path.length !== this.shape.length) {
      throw new RangeError('Invalid multi-dimensional array index')
    }

    return (
      this.offset +
      path.reduce((index, value, dimension) => index + value * this.strides[dimension], 0)
    )
  }
}
