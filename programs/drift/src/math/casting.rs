use crate::error::{DriftResult, ErrorCode};
use crate::math::bn::U192;
use crate::msg;
use std::convert::TryInto;
use std::panic::Location;

/// A helper trait for safe type casting in the Drift protocol.
///
/// Rust does not perform implicit type casting, and standard `as` casting
/// (e.g., `x as u64`) can cause silent truncation or overflows if the value
/// is too large or negative.
///
/// This trait utilizes `try_into()` to safely convert types. If the conversion
/// fails, it logs the exact file and line number of the failure using `#[track_caller]`
/// and returns a `CastingFailure` error instead of panicking.
pub trait Cast: Sized {
    #[track_caller]
    #[inline(always)]
    fn cast<T: std::convert::TryFrom<Self>>(self) -> DriftResult<T> {
        match self.try_into() {
            Ok(result) => Ok(result),
            Err(_) => {
                let caller = Location::caller();
                msg!(
                    "Casting error thrown at {}:{}",
                    caller.file(),
                    caller.line()
                );
                Err(ErrorCode::CastingFailure)
            }
        }
    }
}

impl Cast for U192 {}
impl Cast for u128 {}
impl Cast for u64 {}
impl Cast for u32 {}
impl Cast for u16 {}
impl Cast for u8 {}
impl Cast for usize {}
impl Cast for i128 {}
impl Cast for i64 {}
impl Cast for i32 {}
impl Cast for i16 {}
impl Cast for i8 {}
impl Cast for bool {}
