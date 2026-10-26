# Reading Tracker

Terms for the reader's personal reading history, book pages, annual tracker, and visual digital bookshelf.

## Accounts and storage

**Local account**:
A username-and-password profile stored on one iPad. In the active PWA, its Book, Reading, and bookshelf data live in that browser's IndexedDB. The shelved native app stores its data in local SQLite. A local account is not an online identity and does not sync to other devices.

**IndexedDB journal**:
The browser-managed local database used by the active PWA for reader profiles and journal data. It is scoped to the Leafmark site origin on one device and is never sent to GitHub Pages.

## Books and collection

**Book**:
One title in the reader's personal collection, with its own bibliographic details and personal notes. Details imported from a catalog can be corrected by the reader; the reader's saved details are the ones used in their collection.

**Book page**:
The reader's private page for a book, including bibliographic details, the reader's selected template fields, book-specific fields, and the dates and ratings for each reading attempt.

**Book page template**:
The reader's chosen fields that appear on every book page. A reader can also add fields to an individual book page.

**Reading attempt**:
One pass through a book, with its own start and finish dates and rating. A reread is another attempt for the same book; core book details do not need to be entered again.

**Read books library**:
The reader's collection of books they have finished and added to their reading history.

**To Be Read (TBR)**:
The reader's collection of books they plan to read. When a book is added to the read books library, it leaves the TBR list.

**Digital bookshelf**:
A visual, user-arranged display of books and optional decorative objects. It is the app's home screen and is separate from the read books library.

## Reading activity

**Current book**:
The one book the reader is currently reading. New reading log entries are assigned to it by default and can be reassigned.

**Reading measure**:
The unit selected for a reader's tracker, such as time, pages, or chapters.

**Reading log**:
A dated total of reading activity for a book, measured in the reader's selected unit.

**Reading tracker**:
Calendar views of reading log entries and book start or finish events across a month or year.

**Reading category**:
A user-defined range for the selected reading measure, shown with a chosen color in the reading tracker. Range boundaries stay fixed after use; changing the measure starts a new baseline from a chosen date. Changing a category color updates that category's appearance across all tracker years.

**Rating**:
The reader's half-star or whole-star assessment of a reading attempt, on a one-to-five-star scale.
