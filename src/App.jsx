import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormLabel,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";

const ZOHO = window.ZOHO;

function App() {
  const [initialized, setInitialized] = useState(false); // initialize the widget
  const [entity, setEntity] = useState(null);
  const [entityId, setEntityId] = useState(null);
  const [deal, setDeal] = useState(null);

  const [loading, setLoading] = useState(false);

  // for decision making
  const [initialClosingDate, setInitialClosingDate] = useState(null);
  const [changeCounter, setChangeCounter] = useState(0);

  // snackbar codes
  const [openSnack, setOpenSnack] = useState(false);

  const handleClickSnack = () => {
    setOpenSnack(true);
  };

  const handleCloseSnack = (event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    setOpenSnack(false);
  };

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm();

  const customDate = (date) => {
    const dateObj = new Date(date);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    return `${year}-${month + 1 < 10 ? `0${month + 1}` : month + 1}-${
      day < 10 ? `0${day}` : day
    }`;
  };

  const customDate2 = (date) => {
    const dateObj = new Date(date);
    let year = dateObj.getFullYear();
    let month = dateObj.getMonth();
    let day = dateObj.getDate();
    return `${day < 10 ? `0${day}` : day}/${
      month + 1 < 10 ? `0${month + 1}` : month + 1
    }/${year}`;
  };

  function hexToText(hex) {
    var result = "";
    for (var i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  }

  // Example usage
  var newLine = hexToText("0A");

  useEffect(() => {
    // initialize the app.
    ZOHO.embeddedApp.on("PageLoad", function (data) {
      ZOHO.CRM.UI.Resize({ height: "500", width: "500" });
      setEntity(data?.Entity);
      setEntityId(data?.EntityId?.[0]);
      setInitialized(true);
    });

    ZOHO.embeddedApp.init();
  }, []);

  useEffect(() => {
    if (initialized) {
      const fetchData = async () => {
        const fetchDealResp = await ZOHO.CRM.API.getRecord({
          Entity: entity,
          approved: "both",
          RecordID: entityId,
        });
        const dealData = fetchDealResp?.data?.[0];
        setInitialClosingDate(dealData?.Closing_Date);
        if (
          dealData?.Closing_Date === null ||
          dealData?.Closing_Date === undefined ||
          dealData?.Closing_Date === ""
        ) {
          setChangeCounter(0);
        } else {
          if (
            dealData?.Closing_Date_Change_Counter === null ||
            dealData?.Closing_Date_Change_Counter === undefined ||
            dealData?.Closing_Date_Change_Counter === ""
          ) {
            setChangeCounter(0);
          } else {
            setChangeCounter(dealData?.Closing_Date_Change_Counter);
          }
        }
        setDeal(dealData);
      };

      fetchData();
    }
  }, [initialized]);

  const onsubmit = async (data) => {
    setLoading(true);
    let finalClosingDate =
      data?.Closing_Date !== null && data?.Closing_Date !== undefined
        ? customDate(data?.Closing_Date)?.split("T")?.[0]
        : "";

    if (finalClosingDate === initialClosingDate) {
      setOpenSnack(true);
      setLoading(false);
    } else if (
      finalClosingDate !== initialClosingDate &&
      finalClosingDate !== null &&
      finalClosingDate !== undefined &&
      finalClosingDate !== ""
    ) {
      let config = {
        Entity: entity,
        APIData: {
          id: entityId,
          Closing_Date_Change_Counter: changeCounter + 1,
          Closing_Date: finalClosingDate,
        },
        Trigger: ["workflow"],
      };
      const closingDateUpdateResp = await ZOHO.CRM.API.updateRecord(config);

      if (closingDateUpdateResp?.data?.[0]?.code === "SUCCESS") {
        let fun_name = "developer_send_email_for_closingdate_change";
        let req_data = {
          arguments: JSON.stringify({
            from_date: initialClosingDate,
            to_date: finalClosingDate,
            free_text: data?.free_text,
            link:
              "https://crmplus.zoho.eu/secretsales/index.do/cxapp/crm/org20098504491/tab/Potentials/" +
              deal?.id,
            deal_name: deal?.Deal_Name,
          }),
        };
        const funResp = await ZOHO.CRM.FUNCTIONS.execute(fun_name, req_data);
        console.log(funResp);

        const relatedNotesResp = await ZOHO.CRM.API.getRelatedRecords({
          Entity: entity,
          RecordID: entityId,
          RelatedList: "Notes",
          page: 1,
          per_page: 200,
        });
        const notesData = relatedNotesResp?.data || [];

        if (notesData?.length === 0) {
          const noteCreateResp = await ZOHO.CRM.API.addNotes({
            Entity: entity,
            RecordID: entityId,
            Title: "Closing Date Changed",
            Content:
              new Date().toISOString().split("T")[0] +
              ": Closing Date changed from: " +
              customDate2(initialClosingDate) +
              " to " +
              customDate2(finalClosingDate) +
              "." +
              newLine +
              newLine +
              data?.free_text,
          });
          if (noteCreateResp?.data?.[0]?.code === "SUCCESS") {
            ZOHO.CRM.UI.Popup.closeReload();
          }
        } else if (notesData?.length > 0) {
          let noteExists = false;
          let noteId = "";
          let noteContent = "";
          let noteTitle = "";

          notesData?.forEach((note) => {
            if (
              note?.Note_Title?.toLowerCase()?.includes("closing date changed")
            ) {
              noteExists = true;
              noteContent = note?.Note_Content;
              noteId = note?.id;
              noteTitle = note?.Note_Title;
            }
          });

          // check if note exists or not
          if (noteExists) {
            noteContent =
              noteContent +
              newLine +
              newLine +
              new Date().toISOString().split("T")[0] +
              ": Closing Date changed from: " +
              customDate2(initialClosingDate) +
              " to " +
              customDate2(finalClosingDate) +
              "." +
              newLine +
              newLine +
              data?.free_text;
            const funcName = "developer_update_closing_date_note";
            let req_data = {
              arguments: JSON.stringify({
                noteId: noteId,
                noteTitle: noteTitle,
                noteContent: noteContent,
                dealId: deal?.id,
              }),
            };
            const funcResponse = await ZOHO.CRM.FUNCTIONS.execute(
              funcName,
              req_data
            );
            if (funcResponse?.details?.output === "SUCCESS") {
              ZOHO.CRM.UI.Popup.closeReload();
            }
          } else {
            const noteCreateResp = await ZOHO.CRM.API.addNotes({
              Entity: entity,
              RecordID: entityId,
              Title: "Closing Date Changed",
              Content:
                new Date().toISOString().split("T")[0] +
                ": Closing Date changed from: " +
                customDate2(initialClosingDate) +
                " to " +
                customDate2(finalClosingDate) +
                "." +
                newLine +
                newLine +
                data?.free_text,
            });
            if (noteCreateResp?.data?.[0]?.code === "SUCCESS") {
              ZOHO.CRM.UI.Popup.closeReload();
            }
          }
        }
      }
    }
    console.log(finalClosingDate);
    setLoading(false);
  };

  if (deal) {
    return (
      <Box sx={{ width: "100%" }}>
        <Box
          sx={{
            width: "70%",
            mx: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            mt: 3,
          }}
        >
          <Box
            sx={{ width: "100%" }}
            component="form"
            onSubmit={handleSubmit(onsubmit)}
          >
            <Box sx={{ mb: "1rem" }}>
              <FormLabel
                id="date"
                sx={{ mb: "5px", color: "black", display: "block" }}
              >
                Closing Date
              </FormLabel>
              <Controller
                name="Closing_Date"
                control={control}
                defaultValue={
                  deal?.Closing_Date ? dayjs(deal?.Closing_Date) : null
                }
                rules={{ required: "Closing Date is required" }}
                render={({ field }) => (
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker
                      {...field}
                      value={field.value ? dayjs(field.value) : null}
                      onChange={(newValue) => field.onChange(newValue)}
                      slotProps={{
                        textField: {
                          error: !!errors["Closing_Date"],
                          helperText: errors["Closing_Date"]?.message,
                        },
                      }}
                    />
                  </LocalizationProvider>
                )}
              />
            </Box>

            <Controller
              control={control}
              name="free_text"
              rules={{ required: true }}
              render={({ field }) => (
                <>
                  <FormLabel
                    id="name"
                    sx={{ mb: "10px", mt: "16px", color: "black" }}
                  >
                    Reason For Changing the Closing Date
                  </FormLabel>
                  <TextField
                    multiline
                    rows={3}
                    id="free_text"
                    variant="outlined"
                    fullWidth
                    {...field}
                    sx={{ mb: "1rem", mt: "5px" }}
                    error={errors["free_text"]}
                  />
                </>
              )}
            />

            <Box
              sx={{
                m: "1rem 0",
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <Button
                onClick={() => {
                  ZOHO.CRM.UI.Popup.close();
                }}
                variant="outlined"
                size="small"
              >
                Cancel
              </Button>

              <Button
                variant="contained"
                type="submit"
                loadingPosition="start"
                loading={loading}
                onClick={handleSubmit(onsubmit)}
                size="small"
              >
                Change Closing Date
              </Button>
            </Box>
          </Box>
        </Box>

        <Snackbar
          open={openSnack}
          autoHideDuration={3000}
          onClose={handleCloseSnack}
        >
          <Alert
            onClose={handleCloseSnack}
            severity="error"
            variant="filled"
            sx={{ width: "100%" }}
          >
            No change was made to the Closing Date!
          </Alert>
        </Snackbar>
      </Box>
    );
  } else {
    return (
      <Box
        sx={{
          width: "100%",
          height: "100%",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "1rem",
            margin: "40% 0",
          }}
        >
          <CircularProgress color="inherit" />
          <Typography fontWeight="bold" fontSize="1.5rem">
            Fetching Data. Please Wait...
          </Typography>
        </Box>
      </Box>
    );
  }
}

export default App;
